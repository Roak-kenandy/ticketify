import { Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ConfigService } from '@nestjs/config';
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri =
  'mongodb+srv://mdn:6pcHeB287AQJKLL3@crm.mlnxc.mongodb.net/?retryWrites=true&w=majority&appName=CRM';

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1, // Use the latest server API version
    strict: true, // Enforces strict mode for the MongoDB client
    deprecationErrors: true, // Throws errors on deprecated methods
  },
});

@Injectable()
export class ReportsService {
  constructor(private config: ConfigService) {}

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
    console.log(
      'Fetching data from CRM API' +
        this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/queues',
    );

    console.log(crm_service_request_stages);

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

    console.log(crm_teams);

    return crm_teams.json();
  }

  async findTicketAging(queue: string, team: string) {
    // allow to select queue and team
    // show ticket aging for each ticket
    // show ticket count, aging and percentage

    console.log(queue, team);

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

    try {
      console.log('Connecting to the database...');
      await client.connect();

      // Testing the connection with a "ping" command
      await client.db('admin').command({ ping: 1 });
      console.log(
        'Pinged your deployment. You successfully connected to MongoDB!',
      );
      const coll = client.db('CRM').collection('ServiceRequests');
      console.log('Connected to the collection');
      const cursor = await coll.aggregate(aggregation);
      console.log('Aggregation query executed');
      const result = await cursor.toArray();

      return result;
    } catch (error) {
      console.error('Error connecting to the database:', error.message);
      console.error(error);
    } finally {
      await client.close(); // Ensure we close the client connection after use
    }
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

    try {
      console.log('Connecting to the database...');
      await client.connect();

      // Testing the connection with a "ping" command
      await client.db('admin').command({ ping: 1 });
      console.log(
        'Pinged your deployment. You successfully connected to MongoDB!',
      );
      const coll = client.db('CRM').collection('ServiceRequests');
      console.log('Connected to the collection');
      const cursor = await coll.aggregate(aggregation);
      console.log('Aggregation query executed');
      const result = await cursor.toArray();

      return result;
    } catch (error) {
      console.error('Error connecting to the database:', error.message);
      console.error(error);
    } finally {
      await client.close(); // Ensure we close the client connection after use
    }
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

    try {
      console.log('Connecting to the database...');
      await client.connect();

      // Testing the connection with a "ping" command
      await client.db('admin').command({ ping: 1 });
      console.log(
        'Pinged your deployment. You successfully connected to MongoDB!',
      );
      const coll = client.db('CRM').collection('ServiceRequests');
      console.log('Connected to the collection');
      const cursor = await coll.aggregate(aggregation);
      console.log('Aggregation query executed');
      const result = await cursor.toArray();
      return result;
    } catch (error) {
      console.error('Error connecting to the database:', error.message);
      console.error(error);
    } finally {
      await client.close(); // Ensure we close the client connection after use
    }
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
