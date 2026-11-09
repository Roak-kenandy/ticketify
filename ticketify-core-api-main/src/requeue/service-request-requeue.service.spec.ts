import { ServiceRequestRequeueService } from './service-request-requeue.service';

const NEW_STAGE = { id: 'stage-new', name: 'New', state: 'NEW' };

function build(
  sr: Record<string, unknown>,
  opts: { regressOk?: boolean } = {},
) {
  const claimed = new Set<string>();
  const crm = {
    getServiceRequest: jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, data: sr }),
    request: jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        stages: [
          { id: 'stage-install', name: 'Installation', state: 'IN_PROGRESS' },
          NEW_STAGE,
        ],
      },
    }),
    postServiceRequestAction: jest.fn().mockResolvedValue({
      ok: opts.regressOk ?? true,
      status: opts.regressOk === false ? 400 : 200,
    }),
    updateServiceRequest: jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }),
  };
  const audit = {
    log: jest.fn(async (entry: { idempotency_key?: string }) => {
      if (!entry.idempotency_key) return true;
      if (claimed.has(entry.idempotency_key)) return false;
      claimed.add(entry.idempotency_key);
      return true;
    }),
  };
  const prisma = {
    integrationAuditLog: {
      findUnique: jest.fn(
        async ({ where }: { where: { idempotency_key: string } }) =>
          claimed.has(where.idempotency_key) ? { id: 'x' } : null,
      ),
      deleteMany: jest.fn(
        async ({ where }: { where: { idempotency_key: string } }) => {
          claimed.delete(where.idempotency_key);
          return { count: 1 };
        },
      ),
    },
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new ServiceRequestRequeueService(
    crm as never,
    audit as never,
    logger as never,
    prisma as never,
  );
  return { service, crm, claimed };
}

const inProgress = {
  number: 'S41836',
  state: 'IN_PROGRESS',
  stage: { id: 'stage-install', name: 'Installation' },
  queue: { id: 'queue-nc', name: 'New Connections' },
  assigned_to: { team: { id: 'team-access' }, user: { id: 'tech-1' } },
};

const cause = { action: 'LM_COMPLETED_REQUEUE', key: 'lm-requeue:act-1' };

describe('ServiceRequestRequeueService', () => {
  it("moves the ticket to its queue's New stage and unassigns the technician", async () => {
    const { service, crm } = build(inProgress);
    const result = await service.moveToNew('sr-1', 'LM done', cause);

    expect(result).toEqual({
      moved: true,
      ticket_number: 'S41836',
      stage_name: 'New',
      unassigned: true,
    });
    expect(crm.request).toHaveBeenCalledWith(
      'GET',
      '/service_requests/queues/queue-nc',
    );
    expect(crm.postServiceRequestAction).toHaveBeenCalledWith(
      'sr-1',
      expect.objectContaining({
        action: 'REGRESS',
        stage_id: 'stage-new',
        comment: 'LM done',
        date_achieved: expect.any(Number),
      }),
    );
    expect(crm.updateServiceRequest).toHaveBeenCalledWith('sr-1', {
      assigned_to: { user_id: null, team_id: 'team-access' },
    });
  });

  it('moves a ticket only once per cause', async () => {
    const { service, crm } = build(inProgress);
    await service.moveToNew('sr-1', 'LM done', cause);
    const again = await service.moveToNew('sr-1', 'LM done', cause);

    expect(again).toEqual({
      moved: false,
      reason: 'Already moved for this reason',
    });
    expect(crm.postServiceRequestAction).toHaveBeenCalledTimes(1);
  });

  it('only unassigns a ticket that is already in New', async () => {
    const { service, crm } = build({
      ...inProgress,
      state: 'NEW',
      stage: NEW_STAGE,
    });
    await service.moveToNew('sr-1', 'LM done', cause);

    expect(crm.postServiceRequestAction).not.toHaveBeenCalled();
    expect(crm.updateServiceRequest).toHaveBeenCalled();
  });

  it('leaves closed tickets alone and stops watching them', async () => {
    const { service, crm, claimed } = build({ ...inProgress, state: 'CLOSED' });
    const result = await service.moveToNew('sr-1', 'LM done', cause);

    expect(result).toEqual({ moved: false, reason: 'Ticket is closed' });
    expect(crm.postServiceRequestAction).not.toHaveBeenCalled();
    expect(claimed.has(cause.key)).toBe(true);
  });

  it('retries later when CRM refuses the move', async () => {
    const { service, crm, claimed } = build(inProgress, { regressOk: false });
    const result = await service.moveToNew('sr-1', 'LM done', cause);

    expect(result).toEqual({
      moved: false,
      reason: 'CRM refused to move the ticket (400)',
    });
    expect(crm.updateServiceRequest).not.toHaveBeenCalled();
    expect(claimed.has(cause.key)).toBe(false);
  });
});
