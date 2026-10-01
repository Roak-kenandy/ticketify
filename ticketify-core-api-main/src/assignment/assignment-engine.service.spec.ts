import { AssignmentEngineService } from './assignment-engine.service';
import type { AutoAssignSettings } from './assignment-settings.service';

const TEAM = 'team-male';

const baseSettings: AutoAssignSettings = {
  enabled: true,
  categories: { fault: 'AUTO', new_connections: 'AUTO', relocation: 'MANUAL' },
  strategy: 'least_busy',
  include_busy: false,
  max_open_jobs: 2,
  updated_by_user_id: null,
  updated_at: null,
  last_run_at: null,
  last_run_summary: null,
  pending_alerts: [],
};

const ticket = (id: string, queue: string, extra: Record<string, unknown> = {}) => ({
  id,
  number: id.toUpperCase(),
  priority: 'MEDIUM',
  creation_date: 100,
  queue: { name: queue },
  assigned_to: { user: null },
  ...extra,
});

function setup(options: {
  settings?: Partial<AutoAssignSettings>;
  newTickets: any[];
  inProgress?: any[];
  technicians: { id: string; crm_user_id: string; name: string }[];
}) {
  const settings = { ...baseSettings, ...options.settings };
  const assignSettings = {
    getSettings: jest.fn().mockResolvedValue(settings),
    hasAutoCategory: jest.fn().mockReturnValue(true),
    regions: jest.fn().mockResolvedValue([{ team_id: TEAM, label: 'Malé', enabled: true }]),
    recordLastRun: jest.fn(),
  };
  const tickets = {
    fetchOpenTeamServiceRequests: jest.fn().mockResolvedValue({
      new_tickets: options.newTickets,
      in_progress_tickets: options.inProgress ?? [],
    }),
    assignServiceRequestToUser: jest.fn().mockResolvedValue({ ok: true }),
  };
  const user = {
    fetchCrmTeamMemberIds: jest.fn().mockResolvedValue(options.technicians.map(t => t.crm_user_id)),
    getAutoAssignEligibleTechnicians: jest
      .fn()
      .mockResolvedValue(options.technicians.map(t => ({ ...t, user_location_tracking: [] }))),
  };
  const audit = { log: jest.fn().mockResolvedValue(true) };
  const notifier = {
    technicianAssigned: jest.fn(),
    supervisorsNoTechnician: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };

  const engine = new AssignmentEngineService(
    config as any,
    user as any,
    tickets as any,
    audit as any,
    assignSettings as any,
    notifier as any,
  );
  return { engine, tickets, user, audit, notifier, assignSettings };
}

describe('AssignmentEngineService', () => {
  it('only auto-assigns categories set to AUTO, highest priority and oldest first', async () => {
    const { engine, tickets } = setup({
      newTickets: [
        ticket('f-new', 'Fault', { creation_date: 300 }),
        ticket('reloc', 'Relocation'),
        ticket('stb', 'STB Maintenance'),
        ticket('nc-high', 'New Connections', { priority: 'HIGH', creation_date: 500 }),
        ticket('f-old', 'Fault', { creation_date: 50 }),
      ],
      technicians: [
        { id: 'u1', crm_user_id: 'c1', name: 'Aisha' },
        { id: 'u2', crm_user_id: 'c2', name: 'Bilal' },
      ],
    });

    const [result] = await engine.runAutoAssign();

    expect(result.manual_count).toBe(2);
    expect(result.assigned.map(a => a.ticket_id)).toEqual(['nc-high', 'f-old', 'f-new']);
    expect(tickets.assignServiceRequestToUser).toHaveBeenCalledTimes(3);
  });

  it('spreads work by load and respects the open-job cap', async () => {
    const { engine } = setup({
      settings: { max_open_jobs: 2 },
      newTickets: [ticket('t1', 'Fault'), ticket('t2', 'Fault'), ticket('t3', 'Fault'), ticket('t4', 'Fault')],
      inProgress: [{ id: 'busy', assigned_to: { user: { id: 'c1' } } }],
      technicians: [
        { id: 'u1', crm_user_id: 'c1', name: 'Aisha' },
        { id: 'u2', crm_user_id: 'c2', name: 'Bilal' },
      ],
    });

    const [result] = await engine.runAutoAssign();

    expect(result.assigned.map(a => a.crm_user_id)).toEqual(['c2', 'c1', 'c2']);
    expect(result.waiting).toEqual([
      expect.objectContaining({ ticket_id: 't4', reason: 'all_at_capacity' }),
    ]);
  });

  it('sends exactly one notification per new assignment', async () => {
    const { engine, audit, notifier } = setup({
      newTickets: [ticket('t1', 'Fault'), ticket('t2', 'New Connections')],
      technicians: [{ id: 'u1', crm_user_id: 'c1', name: 'Aisha' }],
    });
    audit.log.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await engine.runAutoAssign();

    expect(notifier.technicianAssigned).toHaveBeenCalledTimes(1);
    expect(notifier.technicianAssigned).toHaveBeenCalledWith('u1', {
      number: 'T1',
      categoryLabel: 'Fault',
    });
  });

  it('keeps tickets in the pool and alerts supervisors once when nobody is eligible', async () => {
    const { engine, tickets, notifier, assignSettings } = setup({
      newTickets: [ticket('t1', 'Fault')],
      technicians: [],
    });
    tickets.fetchOpenTeamServiceRequests.mockResolvedValue({
      new_tickets: [ticket('t1', 'Fault')],
      in_progress_tickets: [],
    });
    const user = (engine as any).user;
    user.fetchCrmTeamMemberIds.mockResolvedValue(['c9']);

    const [result] = await engine.runAutoAssign();

    expect(result.waiting).toEqual([
      expect.objectContaining({ ticket_id: 't1', reason: 'no_eligible_technician' }),
    ]);
    expect(tickets.assignServiceRequestToUser).not.toHaveBeenCalled();
    expect(notifier.supervisorsNoTechnician).toHaveBeenCalledTimes(1);

    const pending = assignSettings.recordLastRun.mock.calls[0][1];
    assignSettings.getSettings.mockResolvedValue({ ...baseSettings, pending_alerts: pending });
    await engine.runAutoAssign();
    expect(notifier.supervisorsNoTechnician).toHaveBeenCalledTimes(1);
  });

  it('dry run assigns nothing and records nothing', async () => {
    const { engine, tickets, notifier, assignSettings } = setup({
      settings: { enabled: false },
      newTickets: [ticket('t1', 'Fault')],
      technicians: [{ id: 'u1', crm_user_id: 'c1', name: 'Aisha' }],
    });

    const [result] = await engine.runAutoAssign({ dry_run: true });

    expect(result.assigned).toHaveLength(1);
    expect(tickets.assignServiceRequestToUser).not.toHaveBeenCalled();
    expect(notifier.technicianAssigned).not.toHaveBeenCalled();
    expect(assignSettings.recordLastRun).not.toHaveBeenCalled();
  });
});
