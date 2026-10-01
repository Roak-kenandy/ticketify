import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmMongoService } from './crm-mongo.service';

export type MasterTicketRow = {
  open_aging: string;
  closed_aging: string;
  status: string;
  priority: string;
  team_name: string;
  ticket_type: string;
  current_assignee: string;
  user_id: string;
  ticket_no: string;
  customer_name: string;
  description: string;
  address: string;
  atoll: string;
  island: string;
  email: string;
  mobile: string;
  stb_type: string;
  closure_date: string;
  closing_comment: string;
};

type MongoReport = {
  'Open Aging'?: string;
  'Closed Aging'?: number | null;
  'Service Request Status'?: string;
  Priority?: string;
  Team?: string;
  'Service Request Categories'?: string;
  'Current Assigned Users'?: string;
  UserID?: string;
  'Service Request'?: string;
  Name?: string;
  Description?: string;
  Address?: string;
  Atoll?: string;
  Island?: string;
  Email?: string;
  Mobile?: string;
  'STB Type/ App'?: string;
  'Closure Date'?: string | null;
  'Closing Comment'?: string;
};

@Injectable()
export class MasterReportService {
  constructor(
    private config: ConfigService,
    private mongo: CrmMongoService,
  ) { }

  async list(query: {
    startDate?: string;
    endDate?: string;
    location?: string;
    type?: string;
    ticketNo?: string;
  }): Promise<MasterTicketRow[]> {
    const dateFilter = this.dateFilter(query.startDate, query.endDate);
    const maxTimeMS = Number(this.config.get('REPORT_QUERY_TIMEOUT_MS') ?? 600_000);
    const results = await this.mongo.run(db =>
      db
        .collection('ServiceRequests')
        .aggregate<MongoReport>(this.pipeline(dateFilter), {
          maxTimeMS,
          allowDiskUse: true,
        })
        .toArray(),
    );

    return results.map(row => this.toRow(row)).filter(row => this.matches(row, query));
  }

  toExcel(rows: MasterTicketRow[]): string {
    const headers = [
      'Open Aging',
      'Closed Aging',
      'UserID',
      'Service Request',
      'Name',
      'Description',
      'Address',
      'Atoll',
      'Island',
      'Email',
      'Mobile',
      'Service Request Status',
      'Priority',
      'Team',
      'Service Request Categories',
      'Current Assigned Users',
      'STB Type/ App',
      'Closure Date',
      'Closing Comment',
    ];
    const header = headers.map(cell => this.cell(cell)).join('');
    const body = rows
      .map(row => {
        const values = [
          row.open_aging,
          row.closed_aging,
          row.user_id,
          row.ticket_no,
          row.customer_name,
          row.description,
          row.address,
          row.atoll,
          row.island,
          row.email,
          row.mobile,
          row.status,
          row.priority,
          row.team_name,
          row.ticket_type,
          row.current_assignee,
          row.stb_type,
          row.closure_date,
          row.closing_comment,
        ];
        return `<Row>${values.map(value => this.cell(value)).join('')}</Row>`;
      })
      .join('');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Master report">
<Table>
<Row>${header}</Row>
${body}
</Table>
</Worksheet>
</Workbook>`;
  }

  private dateFilter(startDate?: string, endDate?: string) {
    if (!startDate?.trim() || !endDate?.trim()) {
      throw new BadRequestException('Start date and end date are required');
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Start date and end date are required');
    }
    end.setHours(23, 59, 59, 999);
    return {
      created_date: {
        $gte: Math.floor(start.getTime() / 1000),
        $lte: Math.floor(end.getTime() / 1000),
      },
    };
  }

  private pipeline(dateFilter: {
    created_date: { $gte: number; $lte: number };
  }) {
    return [
      { $match: dateFilter },
      {
        $lookup: {
          from: 'ContactProfiles',
          localField: 'contact_id',
          foreignField: 'contact_id',
          as: 'contact',
        },
      },
      { $unwind: '$contact' },
      {
        $addFields: {
          Name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$contact.demographics.first_name', ''] },
                  ' ',
                  { $ifNull: ['$contact.demographics.last_name', ''] },
                ],
              },
              chars: ' ',
            },
          },
          UserID: {
            $let: {
              vars: {
                customerCodeField: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$contact.custom_fields',
                        cond: { $eq: ['$$this.key', 'customer_code'] },
                      },
                    },
                    0,
                  ],
                },
              },
              in: { $ifNull: ['$$customerCodeField.value', 'N/A'] },
            },
          },
          Address: {
            $concat: [
              { $ifNull: ['$contact.location.address_line1', ''] },
              ', ',
              { $ifNull: ['$contact.location.address_line2', ''] },
              ', ',
              { $ifNull: ['$contact.location.city', ''] },
              ', ',
              { $ifNull: ['$contact.location.province', ''] },
              ', ',
              {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$contact.location.country', 'MDV'] },
                      then: 'Maldives',
                    },
                  ],
                  default: { $ifNull: ['$contact.location.country', ''] },
                },
              },
            ],
          },
          Email: { $ifNull: ['$contact.email', ''] },
          Mobile: { $ifNull: ['$contact.phone', ''] },
        },
      },
      {
        $lookup: {
          from: 'Devices',
          localField: 'contact_id',
          foreignField: 'ownership.id',
          as: 'device',
        },
      },
      { $unwind: { path: '$device', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          'STB Type/ App': { $ifNull: ['$device.product.name', 'N/A'] },
        },
      },
      {
        $project: {
          _id: 0,
          'Open Aging': {
            $dateToString: {
              format: '%Y-%m-%d %H:%M:%S',
              date: { $toDate: { $multiply: ['$created_date', 1000] } },
            },
          },
          'Closed Aging': {
            $round: [
              {
                $divide: [
                  {
                    $abs: {
                      $subtract: ['$actual_close_date', '$created_date'],
                    },
                  },
                  86400,
                ],
              },
              0,
            ],
          },
          'Service Request Status': { $ifNull: ['$status.name', ''] },
          Priority: '$priority',
          Team: { $ifNull: ['$owner_team.name', ''] },
          'Service Request Categories': { $ifNull: ['$queue.name', ''] },
          'Current Assigned Users': { $ifNull: ['$owner.name', ''] },
          UserID: 1,
          'Service Request': '$number',
          Name: 1,
          Description: '$description',
          Address: 1,
          Atoll: { $ifNull: ['$contact.location.province', ''] },
          Island: { $ifNull: ['$contact.location.city', ''] },
          Email: 1,
          Mobile: 1,
          'STB Type/ App': 1,
          'Closure Date': {
            $cond: [
              { $gt: ['$actual_close_date', 0] },
              {
                $dateToString: {
                  format: '%Y-%m-%d %H:%M:%S',
                  date: {
                    $toDate: { $multiply: ['$actual_close_date', 1000] },
                  },
                },
              },
              '',
            ],
          },
          'Closing Comment': { $ifNull: ['$response', ''] },
        },
      },
    ];
  }

  private toRow(row: MongoReport): MasterTicketRow {
    return {
      open_aging: this.text(row['Open Aging']),
      closed_aging:
        row['Closed Aging'] == null || Number.isNaN(Number(row['Closed Aging']))
          ? ''
          : String(row['Closed Aging']),
      status: this.text(row['Service Request Status']),
      priority: this.text(row.Priority),
      team_name: this.text(row.Team),
      ticket_type: this.text(row['Service Request Categories']),
      current_assignee: this.text(row['Current Assigned Users']),
      user_id: this.text(row.UserID),
      ticket_no: this.text(row['Service Request']),
      customer_name: this.text(row.Name),
      description: this.text(row.Description),
      address: this.text(row.Address).replace(/^(,\s*)+|(,\s*)+$/g, ''),
      atoll: this.text(row.Atoll),
      island: this.text(row.Island),
      email: this.text(row.Email),
      mobile: this.text(row.Mobile),
      stb_type: this.text(row['STB Type/ App']),
      closure_date: this.text(row['Closure Date']),
      closing_comment: this.text(row['Closing Comment']),
    };
  }

  private matches(
    row: MasterTicketRow,
    query: { location?: string; type?: string; ticketNo?: string },
  ): boolean {
    const ticketNo = query.ticketNo?.trim().toLowerCase();
    if (ticketNo && !row.ticket_no.toLowerCase().includes(ticketNo)) {
      return false;
    }
    const location = query.location?.trim().toLowerCase();
    if (location && location !== 'all') {
      const team = row.team_name.toLowerCase();
      if (location === 'male') {
        if (
          !team.includes('male') ||
          team.includes('hulhumale') ||
          team.includes('hulhumalé')
        ) {
          return false;
        }
      }
      if (location === 'hulhumale' && !team.includes('hulhumale') && !team.includes('hulhumalé')) {
        return false;
      }
      if (location === 'transport' && !team.includes('transport')) {
        return false;
      }
    }
    const type = query.type?.trim().toLowerCase();
    if (!type || type === 'all') {
      return true;
    }
    if (type === 'closed') {
      return row.status.toLowerCase() === 'closed';
    }
    const category = row.ticket_type.toLowerCase();
    if (type === 'fault') {
      return category.includes('fault');
    }
    if (type === 'new_connection') {
      return category.includes('new connection');
    }
    if (type === 'relocation') {
      return category.includes('relocat');
    }
    if (type === 'customer_inquiry') {
      return category.includes('inquiry');
    }
    if (type === 'stb_maintenance') {
      return category.includes('stb');
    }
    return true;
  }

  private text(value: unknown): string {
    if (value == null) {
      return '';
    }
    return String(value).trim();
  }

  private cell(value: string): string {
    return `<Cell><Data ss:Type="String">${this.escape(value)}</Data></Cell>`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
