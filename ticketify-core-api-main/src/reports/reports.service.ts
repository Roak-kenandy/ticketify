import { Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ConfigService } from '@nestjs/config';
import { CrmMongoService } from './crm-mongo.service';

@Injectable()
export class ReportsService {
  constructor(
    private config: ConfigService,
    private mongo: CrmMongoService,
  ) { }

  async getTicketQueues() {
    let crm_service_request_stages = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/service_requests/queues',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );


    return crm_service_request_stages.json();
  }

  async getTeams() {
    let crm_teams = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/teams',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );


    return crm_teams.json();
  }

  async findTicketAging(queue: string, team: string) {
    // allow to select queue and team
    // show ticket aging for each ticket
    // show ticket count, aging and percentage


    const aggregation = [
      {
        $match: {
          'owner_team.id': `${team}`,
          'queue.id': `${queue}`,
          'status.name': {
            $in: ['New', 'In Progress'],
          },
        },
      },
      {
        $project: {
          team: '$owner_team.name',
          queue: '$queue.name',
          status: '$status.name',
          ageInSeconds: {
            $subtract: [Math.floor(Date.now() / 1000), '$created_date'],
          },
          created_date: 1,
        },
      },
      {
        $project: {
          ageInDays: {
            $divide: ['$ageInSeconds', 86400],
          },
          team: '$team',
          queue: '$queue',
          status: '$status',
        },
      },
      {
        $group: {
          _id: null,
          totalTickets: {
            $sum: 1,
          },
          '0-1Days': {
            $sum: {
              $cond: [
                {
                  $lte: ['$ageInDays', 1],
                },
                1,
                0,
              ],
            },
          },
          '1-3Days': {
            $sum: {
              $cond: [
                {
                  $lte: ['$ageInDays', 3],
                },
                1,
                0,
              ],
            },
          },
          '3-7Days': {
            $sum: {
              $cond: [
                {
                  $lte: ['$ageInDays', 7],
                },
                1,
                0,
              ],
            },
          },
          '7+Days': {
            $sum: {
              $cond: [
                {
                  $gt: ['$ageInDays', 7],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalTickets: 1,
          '0-1Days': 1,
          '1-3Days': 1,
          '3-7Days': 1,
          '7+Days': 1,
          '0-1DaysPercentage': {
            $multiply: [
              {
                $divide: ['$0-1Days', '$totalTickets'],
              },
              100,
            ],
          },
          '1-3DaysPercentage': {
            $multiply: [
              {
                $divide: ['$1-3Days', '$totalTickets'],
              },
              100,
            ],
          },
          '3-7DaysPercentage': {
            $multiply: [
              {
                $divide: ['$3-7Days', '$totalTickets'],
              },
              100,
            ],
          },
          '7+DaysPercentage': {
            $multiply: [
              {
                $divide: ['$7+Days', '$totalTickets'],
              },
              100,
            ],
          },
        },
      },
    ];

    return this.mongo.run(db =>
      db.collection('ServiceRequests').aggregate(aggregation).toArray(),
    );
  }

  async findTicketByTeam() {
    const aggregation = [
      {
        $group: {
          _id: {
            owner_team: '$owner_team.name',
            queue_stage: '$queue.name',
          },
          total: {
            $sum: 1,
          },
          closed_total: {
            $sum: {
              $cond: [
                {
                  $eq: ['$status.name', 'Closed'],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $group: {
          _id: '$_id.owner_team',
          stages: {
            $push: {
              stage: '$_id.queue_stage',
              total: '$total',
              closed_total: '$closed_total',
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          owner_team: '$_id',
          stages: {
            $arrayToObject: {
              $map: {
                input: '$stages',
                as: 'stage',
                in: {
                  k: '$$stage.stage',
                  v: {
                    total: '$$stage.total',
                    closed_total: '$$stage.closed_total',
                  },
                },
              },
            },
          },
        },
      },
    ];

    return this.mongo.run(db =>
      db.collection('ServiceRequests').aggregate(aggregation).toArray(),
    );
  }

  async findTotalTickets() {
    // show tickets for each remaining tickets
    // show individual queue tickets

    const aggregation = [
      {
        $group: {
          _id: {
            owner_team: '$owner_team.name',
            queue_stage: '$queue.name',
          },
          total: { $sum: 1 },
          closed_total: {
            $sum: {
              $cond: [{ $eq: ['$status.name', 'Closed'] }, 1, 0],
            },
          },
        },
      },
      {
        $group: {
          _id: '$_id.owner_team',
          stages: {
            $push: {
              stage: '$_id.queue_stage',
              total: '$total',
              closed_total: '$closed_total',
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          owner_team: '$_id',
          stages: {
            $arrayToObject: {
              $map: {
                input: '$stages',
                as: 'stage',
                in: {
                  k: '$$stage.stage',
                  v: {
                    total: '$$stage.total',
                    closed_total: '$$stage.closed_total',
                  },
                },
              },
            },
          },
        },
      },
      // Compute total tickets per queue stage (ignoring owner_team)
      {
        $unwind: '$stages', // Unwind stages to group them separately
      },
      {
        $group: {
          _id: '$stages', // Group by queue stages only
          total: { $sum: '$stages.total' },
          closed_total: { $sum: '$stages.closed_total' },
        },
      },
      {
        $project: {
          _id: 0,
          queue_stage: '$_id',
          total: 1,
          closed_total: 1,
        },
      },
    ];

    return this.mongo.run(db =>
      db.collection('ServiceRequests').aggregate(aggregation).toArray(),
    );
  }

  formatAgingCsv(
    row: Record<string, number>,
    meta: { queue?: string; team?: string },
  ): string {
    const headers = [
      'team_id',
      'queue_id',
      'totalTickets',
      '0-1Days',
      '1-3Days',
      '3-7Days',
      '7+Days',
      '0-1DaysPercentage',
      '1-3DaysPercentage',
      '3-7DaysPercentage',
      '7+DaysPercentage',
    ];
    const values = [
      meta.team ?? '',
      meta.queue ?? '',
      row.totalTickets ?? 0,
      row['0-1Days'] ?? 0,
      row['1-3Days'] ?? 0,
      row['3-7Days'] ?? 0,
      row['7+Days'] ?? 0,
      row['0-1DaysPercentage'] ?? 0,
      row['1-3DaysPercentage'] ?? 0,
      row['3-7DaysPercentage'] ?? 0,
      row['7+DaysPercentage'] ?? 0,
    ];
    return `${headers.join(',')}\n${values.join(',')}\n`;
  }

  formatTeamReportCsv(rows: any[]): string {
    const headers = [
      'owner_team',
      'queue_stage',
      'total',
      'closed_total',
      'open_total',
    ];
    const lines = rows.map(r =>
      [
        r.owner_team ?? r._id?.owner_team ?? '',
        r.queue_stage ?? r._id?.queue_stage ?? '',
        r.total ?? 0,
        r.closed_total ?? 0,
        r.open_total ?? 0,
      ].join(','),
    );
    return `${headers.join(',')}\n${lines.join('\n')}\n`;
  }
}
