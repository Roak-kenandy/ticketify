import { ProvisioningStatus } from '@prisma/client';
import { DummyIncaClient } from 'src/infrastructure/inca/dummy-inca.client';
import {
  ProvisioningRunner,
  RunBaseline,
  RunInput,
  StageFailure,
} from './provisioning-runner';
import { classifySignal, provisioningPolicy } from './provisioning-policy';

const config = {
  range: { min_dbm: -27, max_dbm: -8 },
  todoTimeoutMs: 1000,
  todoPollMs: 1,
};

function recorder() {
  const state = {
    stages: [] as ProvisioningStatus[],
    steps: [] as string[],
    baseline: null as RunBaseline | null,
  };
  return {
    state,
    rec: {
      enter: async (status: ProvisioningStatus) =>
        void state.stages.push(status),
      step: async (message: string) => void state.steps.push(message),
      saveBaseline: async (baseline: RunBaseline) =>
        void (state.baseline = baseline),
    },
  };
}

function input(overrides: Partial<RunInput>): RunInput {
  return {
    action: 'NEW_CONNECTION',
    client_identifier: 'contact-1',
    customer_name: 'Aisha',
    ont_serial: 'HWTC0001ABCD',
    service_area: "Male'",
    device_type: 'HG8145X6',
    package: 'Fibre 100 Mbps',
    address: 'Majeedhee Magu',
    pppoe_username: 'mn1001',
    new_ont: false,
    ...overrides,
  };
}

describe('ProvisioningRunner', () => {
  let inca: DummyIncaClient;

  beforeEach(() => {
    inca = new DummyIncaClient({ latencyMs: 0, offline: false });
  });

  it('runs a new connection through every stage and installs the ONT', async () => {
    const { rec, state } = recorder();
    const outcome = await new ProvisioningRunner(inca, rec, config).run(
      input({}),
      null,
      'secret123',
    );

    expect(state.stages).toEqual([
      'VALIDATING',
      'REGISTERING_ONT',
      'APPLYING_CONFIG',
      'WAITING_TODO',
      'VERIFYING',
    ]);
    expect(outcome.installs_ont).toBe(true);
    expect(outcome.ont_serial).toBe('HWTC0001ABCD');
    expect(outcome.result).toMatchObject({
      pppoe_verified: true,
      connected: true,
    });
    expect(JSON.stringify(outcome.result)).not.toContain('secret123');
  });

  it('registers only on the OLT / PON the technician confirmed', async () => {
    const detected = await inca.detectUnregistered('HWTC0002ABCD');
    expect(detected?.device_type).toBe('HG8145X6');

    const ok = recorder();
    await expect(
      new ProvisioningRunner(inca, ok.rec, config).run(
        input({
          ont_serial: 'HWTC0002ABCD',
          confirmed_olt_id: detected?.olt_id,
          confirmed_pon: detected?.pon,
        }),
        null,
        null,
      ),
    ).resolves.toMatchObject({ installs_ont: true });

    const moved = recorder();
    await expect(
      new ProvisioningRunner(inca, moved.rec, config).run(
        input({
          client_identifier: 'contact-2',
          ont_serial: 'HWTC0003ABCD',
          confirmed_olt_id: 'OLT-99',
          confirmed_pon: '0/0/0',
        }),
        null,
        null,
      ),
    ).rejects.toMatchObject({ stage: 'REGISTERING_ONT' });
  });

  it('retries a failed registration without duplicating the subscriber', async () => {
    const run = (rec: ReturnType<typeof recorder>['rec']) =>
      new ProvisioningRunner(inca, rec, config).run(
        input({ ont_serial: 'HWTCFAILREG1' }),
        null,
        null,
      );

    const first = recorder();
    await expect(run(first.rec)).rejects.toMatchObject({
      stage: 'REGISTERING_ONT',
    });

    const second = recorder();
    const outcome = await run(second.rec);
    expect(outcome.installs_ont).toBe(true);

    const third = recorder();
    await run(third.rec);
    expect(third.state.steps.join(' ')).toContain('reused');
    const subscriber = await inca.findSubscriber('contact-1', 'new_connection');
    expect(subscriber?.onu_serials).toEqual(['HWTCFAILREG1']);
  });

  it('reconciles after a Todo failure instead of creating a second subscriber', async () => {
    const first = recorder();
    await expect(
      new ProvisioningRunner(inca, first.rec, config).run(
        input({ ont_serial: 'HWTCFAILTODO' }),
        null,
        null,
      ),
    ).rejects.toMatchObject({ stage: 'WAITING_TODO' });

    const second = recorder();
    await new ProvisioningRunner(inca, second.rec, config).run(
      input({ ont_serial: 'HWTCFAILTODO' }),
      null,
      null,
    );
    expect(
      second.state.steps.some((step) =>
        step.includes('Subscriber already exists'),
      ),
    ).toBe(true);
  });

  it('refuses a new connection for a customer that already has a subscriber', async () => {
    await inca.findSubscriber('contact-9', 'existing_service');
    const { rec } = recorder();
    await expect(
      new ProvisioningRunner(inca, rec, config).run(
        input({ client_identifier: 'contact-9' }),
        null,
        null,
      ),
    ).rejects.toThrow(/already has an INCA subscriber/);
  });

  it('replaces the ONT on the same Terminal Node and keeps PPPoE and package', async () => {
    const before = await inca.findSubscriber('contact-2', 'existing_service');
    const { rec, state } = recorder();
    const outcome = await new ProvisioningRunner(inca, rec, config).run(
      input({
        action: 'ONT_REPLACEMENT',
        client_identifier: 'contact-2',
        ont_serial: 'HWTCNEW00001',
      }),
      null,
      null,
    );
    const after = await inca.getSubscriber(before!.terminal_node_id);

    expect(after?.onu_serials).toEqual(['HWTCNEW00001']);
    expect(after?.pppoe_username).toBe(before?.pppoe_username);
    expect(after?.package).toBe(before?.package);
    expect(outcome.old_ont_serial).toBe(before?.onu_serials[0]);
    expect(state.baseline?.old_ont_serial).toBe(before?.onu_serials[0]);
  });

  it('retries a replacement from the saved baseline after the old ONU was revoked', async () => {
    const before = await inca.findSubscriber('contact-3', 'existing_service');
    const first = recorder();
    const replacement = input({
      action: 'ONT_REPLACEMENT',
      client_identifier: 'contact-3',
      ont_serial: 'HWTCFAILCFG1',
    });
    await expect(
      new ProvisioningRunner(inca, first.rec, config).run(
        replacement,
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(StageFailure);

    const second = recorder();
    const outcome = await new ProvisioningRunner(inca, second.rec, config).run(
      replacement,
      first.state.baseline,
      null,
    );
    expect(outcome.old_ont_serial).toBe(before?.onu_serials[0]);
    expect(
      (await inca.getSubscriber(before!.terminal_node_id))?.onu_serials,
    ).toEqual(['HWTCFAILCFG1']);
  });

  it('relocates without creating a new subscriber', async () => {
    const before = await inca.findSubscriber('contact-4', 'existing_service');
    const { rec } = recorder();
    const outcome = await new ProvisioningRunner(inca, rec, config).run(
      input({
        action: 'RELOCATION',
        client_identifier: 'contact-4',
        service_area: 'Hulhumale',
        ont_serial: null,
      }),
      null,
      null,
    );
    const after = await inca.findSubscriber('contact-4', 'existing_service');
    expect(after?.terminal_node_id).toBe(before?.terminal_node_id);
    expect(after?.service_area).toBe('Hulhumale');
    expect(outcome.installs_ont).toBe(false);
  });

  it('records a signal check with a range verdict', async () => {
    const { rec } = recorder();
    const outcome = await new ProvisioningRunner(inca, rec, config).run(
      input({
        action: 'SIGNAL_CHECK',
        client_identifier: 'contact-5',
        ont_serial: null,
      }),
      null,
      null,
    );
    expect(outcome.result.signal_result).toBe('WITHIN_RANGE');
    expect(outcome.installs_ont).toBe(false);
  });

  it('fails with an integration error when INCA is down', async () => {
    const offline = new DummyIncaClient({ latencyMs: 0, offline: true });
    const { rec } = recorder();
    await expect(
      new ProvisioningRunner(offline, rec, config).run(input({}), null, null),
    ).rejects.toMatchObject({
      unavailable: true,
      stage: 'VALIDATING',
    });
  });
});

describe('provisioning policy', () => {
  it('requires provisioning for new connections and relocations only', () => {
    expect(provisioningPolicy('new_connections', '').required_action).toBe(
      'NEW_CONNECTION',
    );
    expect(provisioningPolicy('relocation', '').required_action).toBe(
      'RELOCATION',
    );
    expect(provisioningPolicy('fault', '').required_action).toBeNull();
    expect(provisioningPolicy('fault', 'fault').signal_required).toBe(true);
  });

  it('offers all four actions with the SR-type ones first', () => {
    const relocation = provisioningPolicy('relocation', '');
    expect(relocation.recommended).toEqual(['RELOCATION', 'SIGNAL_CHECK']);
    expect(relocation.actions).toEqual([
      'RELOCATION',
      'SIGNAL_CHECK',
      'NEW_CONNECTION',
      'ONT_REPLACEMENT',
    ]);
    expect(provisioningPolicy(null, '').actions).toHaveLength(4);
  });

  it('classifies optical readings against the configured range', () => {
    const range = { min_dbm: -27, max_dbm: -8 };
    const reading = (rx: number | null) => ({
      online: true,
      rx_dbm: rx,
      tx_dbm: 2,
      olt_rx_dbm: null,
      alarms: [],
      read_at: '',
    });
    expect(classifySignal(reading(-20), range)).toBe('WITHIN_RANGE');
    expect(classifySignal(reading(-29.4), range)).toBe('OUTSIDE_RANGE');
    expect(classifySignal(reading(null), range)).toBe('NO_READING');
    expect(classifySignal(null, range)).toBe('NO_READING');
  });
});
