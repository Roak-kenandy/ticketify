import { StatusBoardService } from './status-board.service';
import { ACCESS } from 'src/auth/access/access.fixtures';

function build(opts: { activitiesOk?: boolean } = {}) {
  const open = [
    { id: 'sr-1', number: 'S1', state: 'IN_PROGRESS' },
    { id: 'sr-2', number: 'S2', state: 'NEW' },
    { id: 'sr-3', number: 'S3', state: 'NEW' },
  ];
  const tickets = {
    fetchOpenTickets: jest.fn().mockResolvedValue(open),
    fetchOpenTicketsAllTeams: jest
      .fn()
      .mockResolvedValue({ tickets: open, failed_teams: [] }),
  };
  const crm = {
    listActivitiesPage: jest.fn().mockResolvedValue(
      opts.activitiesOk === false
        ? { ok: false, status: 500, data: null }
        : {
            ok: true,
            status: 200,
            data: {
              content: [
                {
                  state: 'PENDING',
                  service_request: { id: 'sr-2' },
                  created_date: 1794200000,
                },
                // Not one of the caller's open tickets.
                { state: 'PENDING', service_request: { id: 'sr-99' } },
              ],
              paging: { has_more: false },
            },
          },
    ),
  };
  const prisma = {
    ticketPayment: {
      findMany: jest.fn().mockResolvedValue([
        {
          crm_ticket_id: 'sr-1',
          reference: 'TKT-PAY-1',
          amount_mvr: 250,
          created_at: new Date('2026-11-10T03:00:00Z'),
        },
      ]),
    },
    ticketSchedule: {
      findMany: jest.fn().mockResolvedValue([
        {
          crm_ticket_id: 'sr-3',
          scheduled_at: new Date('2026-11-12T05:00:00Z'),
        },
        {
          crm_ticket_id: 'sr-3',
          scheduled_at: new Date('2026-11-11T05:00:00Z'),
        },
        // Scheduled once only: not rescheduled.
        {
          crm_ticket_id: 'sr-2',
          scheduled_at: new Date('2026-11-11T05:00:00Z'),
        },
      ]),
    },
  };
  const workflow = { getNoResponseActivityTypeId: () => 'nr-type' };
  const logger = { warn: jest.fn() };
  const service = new StatusBoardService(
    tickets as never,
    crm as never,
    prisma as never,
    workflow as never,
    logger as never,
  );
  return { service, tickets, crm };
}

describe('StatusBoardService', () => {
  it('shows technicians their own tickets and everyone else all teams', async () => {
    const { service, tickets } = build();
    const mine = await service.board({
      crm_user_id: 'crm-tech',
      access: ACCESS.technician,
    });
    expect(mine.scope).toBe('mine');
    expect(tickets.fetchOpenTickets).toHaveBeenCalledWith('crm-tech');

    const all = await service.board({
      crm_user_id: 'crm-admin',
      access: ACCESS.supervisor,
    });
    expect(all.scope).toBe('all');
    expect(tickets.fetchOpenTicketsAllTeams).toHaveBeenCalled();
    expect(tickets.fetchOpenTickets).toHaveBeenCalledTimes(1);
  });

  it('sorts open tickets into the four status buckets', async () => {
    const { service, crm } = build();
    const board = await service.board({ crm_user_id: 'c', access: ACCESS.admin });
    expect(crm.listActivitiesPage).toHaveBeenCalledWith(
      expect.objectContaining({ type_id: 'nr-type', state: 'PENDING' }),
    );
    expect(board.counts).toEqual({
      pending: 3,
      no_response: 1,
      payment_pending: 1,
      rescheduled: 1,
    });
    expect(board.tickets.no_response[0]).toMatchObject({
      id: 'sr-2',
      status_info: { no_response_since: 1794200000 },
    });
    expect(board.tickets.payment_pending[0].status_info?.payment).toEqual({
      reference: 'TKT-PAY-1',
      amount_mvr: 250,
      created_at: '2026-11-10T03:00:00.000Z',
    });
    expect(board.tickets.rescheduled[0].status_info).toEqual({
      scheduled_at: '2026-11-12T05:00:00.000Z',
      schedule_count: 2,
    });
  });

  it('still answers when the CRM cannot list No response activities', async () => {
    const { service } = build({ activitiesOk: false });
    const board = await service.board({ crm_user_id: 'c', access: ACCESS.admin });
    expect(board.no_response_available).toBe(false);
    expect(board.counts.no_response).toBe(0);
    expect(board.counts.pending).toBe(3);
  });
});
