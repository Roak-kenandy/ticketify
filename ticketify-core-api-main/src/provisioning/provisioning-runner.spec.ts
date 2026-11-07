import { ProvisioningStatus } from '@prisma/client';
import { DummyIncaClient } from 'src/infrastructure/inca/dummy-inca.client';
import { IncaNotIntegratedError } from 'src/infrastructure/inca/inca.types';
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
    const detected = await inca.detectOnOlt('HWTC0002ABCD');
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

  it('refuses to register an unconfirmed ONT when confirmation is required', async () => {
    const strict = { ...config, requireOltConfirmation: true };
    const register = jest.spyOn(inca, 'registerOnt');
    await expect(
      new ProvisioningRunner(inca, recorder().rec, strict).run(
        input({ ont_serial: 'HWTC0002ABCD' }),
        null,
        null,
      ),
    ).rejects.toMatchObject({
      stage: 'REGISTERING_ONT',
      message: expect.stringContaining('confirm its OLT / PON'),
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('demands PPPoE for an Ooredoo ONT before writing anything to INCA', async () => {
    const serial = 'HWTCOOREDOO01';
    const noUser = recorder();
    await expect(
      new ProvisioningRunner(inca, noUser.rec, config).run(
        input({ ont_serial: serial, pppoe_username: null }),
        null,
        'secret123',
      ),
    ).rejects.toMatchObject({
      stage: 'VALIDATING',
      message: expect.stringContaining('PPPoE'),
    });
    const noPassword = recorder();
    await expect(
      new ProvisioningRunner(inca, noPassword.rec, config).run(
        input({ ont_serial: serial }),
        null,
        null,
      ),
    ).rejects.toMatchObject({
      stage: 'VALIDATING',
      message: expect.stringContaining('PPPoE password'),
    });
    await expect(inca.findDevice(serial)).resolves.toBeNull();
  });

  it('sets PPPoE on the Terminal Node of an Ooredoo ONT and verifies it', async () => {
    const setPppoe = jest.spyOn(inca, 'setPppoe');
    const { rec, state } = recorder();
    const outcome = await new ProvisioningRunner(inca, rec, config).run(
      input({ ont_serial: 'HWTCOOREDOO02' }),
      null,
      'secret123',
    );

    expect(setPppoe).toHaveBeenCalledWith(expect.any(String), {
      username: 'mn1001',
      password: 'secret123',
    });
    expect(state.baseline).toMatchObject({ pppoe_required: true });
    expect(state.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MVOOREDOO firmware: PPPoE is required'),
        expect.stringMatching(/^PPPoE mn1001 set on Terminal Node/),
      ]),
    );
    expect(outcome.result).toMatchObject({
      pppoe_required: true,
      pppoe_verified: true,
    });
    expect(JSON.stringify(outcome.result)).not.toContain('secret123');
  });

  it('refuses an ONT still configured on the OLT without an INCA record', async () => {
    const run = recorder();
    await expect(
      new ProvisioningRunner(inca, run.rec, config).run(
        input({ client_identifier: 'contact-4', ont_serial: 'HWTCONOLT001' }),
        null,
        null,
      ),
    ).rejects.toMatchObject({
      stage: 'REGISTERING_ONT',
      message: expect.stringContaining('autofind'),
    });
    await expect(inca.findDevice('HWTCONOLT001')).resolves.toBeNull();
  });

  it('registers the ONT, creates the terminal node and stops cleanly where the INCA integration ends', async () => {
    class PartialInca extends DummyIncaClient {
      findSubscriber() {
        return Promise.resolve(null);
      }
      async findDevice(serial: string) {
        const device = await super.findDevice(serial);
        return device && { ...device, terminal_node_id: null };
      }
      async createSubscriber(
        ...args: Parameters<DummyIncaClient['createSubscriber']>
      ) {
        const created = await super.createSubscriber(...args);
        return {
          ...created,
          onu_serials: [],
          notes: [`Terminal Node ${created.terminal_node_id} created`],
        };
      }
      addOnu(): never {
        throw new IncaNotIntegratedError('Attaching the ONU');
      }
    }
    const partial = new PartialInca({ latencyMs: 0, offline: false });
    const run = (rec: ReturnType<typeof recorder>['rec']) =>
      new ProvisioningRunner(partial, rec, config).run(
        input({
          ont_serial: 'HWTC0009ABCD',
          service_area: null,
          package: null,
        }),
        null,
        null,
      );

    const first = recorder();
    await expect(run(first.rec)).rejects.toMatchObject({
      stage: 'APPLYING_CONFIG',
      unavailable: true,
      message: 'Attaching the ONU is not integrated with INCA yet.',
    });
    expect(first.state.steps.join(' ')).toMatch(/Terminal Node \S+ created/);
    expect((await partial.findDevice('HWTC0009ABCD'))?.registered).toBe(true);

    const retry = recorder();
    await expect(run(retry.rec)).rejects.toMatchObject({
      stage: 'APPLYING_CONFIG',
    });
    expect(retry.state.steps.join(' ')).toContain('reused');
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

  it('keeps the existing PPPoE when an Ooredoo ONT replaces the ONT', async () => {
    const setPppoe = jest.spyOn(inca, 'setPppoe');
    const { rec, state } = recorder();
    const outcome = await new ProvisioningRunner(inca, rec, config).run(
      input({
        action: 'ONT_REPLACEMENT',
        client_identifier: 'contact-5',
        ont_serial: 'HWTCOOREDOO03',
        pppoe_username: null,
      }),
      null,
      null,
    );
    expect(setPppoe).not.toHaveBeenCalled();
    expect(state.steps).toContain(
      "PPPoE already set on the customer's Terminal Node; kept",
    );
    expect(outcome.result).toMatchObject({ pppoe_required: false });
  });

  it('asks for PPPoE when an Ooredoo replacement lands on a node without it', async () => {
    const before = await inca.findSubscriber('contact-6', 'existing_service');
    const noPppoe = { ...before!, pppoe_configured: false };
    const replacement = input({
      action: 'ONT_REPLACEMENT',
      client_identifier: 'contact-6',
      ont_serial: 'HWTCOOREDOO04',
      pppoe_username: 'ooredoo.user',
    });

    jest.spyOn(inca, 'findSubscriber').mockResolvedValueOnce(noPppoe);
    await expect(
      new ProvisioningRunner(inca, recorder().rec, config).run(
        { ...replacement, pppoe_username: null },
        null,
        null,
      ),
    ).rejects.toMatchObject({
      stage: 'VALIDATING',
      message: expect.stringContaining('PPPoE'),
    });

    const setPppoe = jest.spyOn(inca, 'setPppoe');
    jest.spyOn(inca, 'findSubscriber').mockResolvedValueOnce(noPppoe);
    const outcome = await new ProvisioningRunner(
      inca,
      recorder().rec,
      config,
    ).run(replacement, null, 'secret123');
    expect(setPppoe).toHaveBeenCalledWith(before!.terminal_node_id, {
      username: 'ooredoo.user',
      password: 'secret123',
    });
    expect(outcome.result).toMatchObject({
      pppoe_required: true,
      pppoe_verified: true,
      pppoe_username: 'ooredoo.user',
    });
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

  it('replaces an ONT found by its current serial when INCA has no customer lookup', async () => {
    class LiveLikeInca extends DummyIncaClient {
      findSubscriber(): Promise<null> {
        return Promise.reject(new IncaNotIntegratedError('Subscriber lookup'));
      }
    }
    const live = new LiveLikeInca({ latencyMs: 0, offline: false });
    const seeded = await DummyIncaClient.prototype.findSubscriber.call(
      live,
      'contact-5',
      'existing_service',
    );
    const oldSerial = seeded!.onu_serials[0];
    const replacement = input({
      action: 'ONT_REPLACEMENT',
      client_identifier: 'unknown-to-inca',
      old_ont_serial: oldSerial,
      ont_serial: 'HWTCNEW00005',
    });

    await expect(
      new ProvisioningRunner(live, recorder().rec, config).run(
        { ...replacement, old_ont_serial: 'HWTCMISSING1' },
        null,
        null,
      ),
    ).rejects.toMatchObject({
      stage: 'VALIDATING',
      message: expect.stringContaining('not attached to any Terminal Node'),
    });

    const { rec, state } = recorder();
    const outcome = await new ProvisioningRunner(live, rec, config).run(
      replacement,
      null,
      null,
    );
    expect(outcome.old_ont_serial).toBe(oldSerial);
    expect(
      (await live.getSubscriber(seeded!.terminal_node_id))?.onu_serials,
    ).toEqual(['HWTCNEW00005']);
    expect(state.steps).toEqual(
      expect.arrayContaining([
        `Old ONU ${oldSerial} revoked from Terminal Node ${seeded!.terminal_node_id}`,
        'Waiting for INCA to remove it from the OLT',
      ]),
    );

    // A retry resumes from the saved node even though the old serial is gone.
    const retry = await new ProvisioningRunner(
      live,
      recorder().rec,
      config,
    ).run(replacement, state.baseline, null);
    expect(retry.old_ont_serial).toBe(oldSerial);
  });

  describe('relocation', () => {
    const destination = {
      city_id: '47',
      new_city: null,
      street_id: '4100',
      new_street: null,
      number: '22',
    };
    const relocation = (overrides: Partial<RunInput> = {}) =>
      input({
        action: 'RELOCATION',
        client_identifier: 'contact-4',
        ont_serial: null,
        location: destination,
        ...overrides,
      });

    it('only moves the address when the ONT is still on its PON', async () => {
      const before = await inca.findSubscriber('contact-4', 'existing_service');
      const revoke = jest.spyOn(inca, 'revokeOnu');
      const add = jest.spyOn(inca, 'addOnu');
      const { rec, state } = recorder();
      const outcome = await new ProvisioningRunner(inca, rec, config).run(
        relocation(),
        null,
        null,
      );
      const after = await inca.getSubscriber(before!.terminal_node_id);
      expect(after?.address).toBe('Nirolhu Magu 22, Hulhumale');
      expect(after?.onu_serials).toEqual(before?.onu_serials);
      expect(revoke).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({
        installs_ont: false,
        old_ont_serial: null,
      });
      expect(outcome.result).toMatchObject({
        previous_address: 'Asaree Hingun 1001, Male',
        address: 'Nirolhu Magu 22, Hulhumale',
        rebound: false,
      });
      expect(state.steps).toEqual(
        expect.arrayContaining([
          `Terminal Node ${before!.terminal_node_id} moved to Nirolhu Magu 22, Hulhumale (no new subscriber created)`,
        ]),
      );
    });

    it('will not move an ONT to an unconfirmed OLT when confirmation is required', async () => {
      jest.spyOn(inca, 'detectOnOlt').mockResolvedValue({
        olt_id: 'OLT-9',
        olt_name: 'OLT_9',
        pon: '0/2/4',
        olt_state: 'UNREGISTERED',
        online: null,
      });
      const revoke = jest.spyOn(inca, 'revokeOnu');
      const strict = { ...config, requireOltConfirmation: true };
      await expect(
        new ProvisioningRunner(inca, recorder().rec, strict).run(
          relocation({ client_identifier: 'contact-7' }),
          null,
          null,
        ),
      ).rejects.toMatchObject({ stage: 'REGISTERING_ONT' });
      expect(revoke).not.toHaveBeenCalled();
    });

    it('revokes, moves to the new OLT and re-adds an ONT seen on another OLT', async () => {
      const before = await inca.findSubscriber('contact-7', 'existing_service');
      const serial = before!.onu_serials[0];
      jest.spyOn(inca, 'detectOnOlt').mockResolvedValue({
        olt_id: 'OLT-9',
        olt_name: 'OLT_9',
        pon: '0/2/4',
        olt_state: 'UNREGISTERED',
        online: null,
      });
      const add = jest
        .spyOn(inca, 'addOnu')
        .mockRejectedValueOnce(new Error('OLT busy'));
      const first = recorder();
      await expect(
        new ProvisioningRunner(inca, first.rec, config).run(
          relocation({ client_identifier: 'contact-7' }),
          null,
          null,
        ),
      ).rejects.toBeInstanceOf(StageFailure);
      expect(first.state.steps).toEqual(
        expect.arrayContaining([
          `ONU ${serial} revoked from Terminal Node ${before!.terminal_node_id}`,
          `ONT ${serial} record moved to OLT OLT-9 in INCA`,
        ]),
      );

      const move = jest.spyOn(inca, 'moveDevice');
      const second = recorder();
      const outcome = await new ProvisioningRunner(
        inca,
        second.rec,
        config,
      ).run(
        relocation({ client_identifier: 'contact-7' }),
        first.state.baseline,
        null,
      );
      expect(add).toHaveBeenCalledTimes(2);
      expect(move).toHaveReturnedTimes(1);
      expect(second.state.steps).toEqual(
        expect.arrayContaining([`ONU ${serial} already revoked; skipped`]),
      );
      expect((await inca.findDevice(serial))?.olt_id).toBe('OLT-9');
      expect(
        (await inca.getSubscriber(before!.terminal_node_id))?.onu_serials,
      ).toEqual([serial]);
      expect(outcome.result).toMatchObject({
        olt_id: 'OLT-9',
        pon: '0/2/4',
        rebound: true,
        previous_address: 'Asaree Hingun 1001, Male',
      });
    });

    it('swaps in a new ONT at the destination like a replacement', async () => {
      const before = await inca.findSubscriber('contact-8', 'existing_service');
      const outcome = await new ProvisioningRunner(
        inca,
        recorder().rec,
        config,
      ).run(
        relocation({
          client_identifier: 'contact-8',
          new_ont: true,
          ont_serial: 'HWTCRELOC001',
        }),
        null,
        null,
      );
      expect(
        (await inca.getSubscriber(before!.terminal_node_id))?.onu_serials,
      ).toEqual(['HWTCRELOC001']);
      expect(outcome).toMatchObject({
        installs_ont: true,
        ont_serial: 'HWTCRELOC001',
        old_ont_serial: before!.onu_serials[0],
      });
      expect(outcome.result).toMatchObject({
        recovered_ont_serial: before!.onu_serials[0],
        address: 'Nirolhu Magu 22, Hulhumale',
      });
    });

    it('needs the destination address', async () => {
      await expect(
        new ProvisioningRunner(inca, recorder().rec, config).run(
          relocation({ location: null }),
          null,
          null,
        ),
      ).rejects.toMatchObject({
        stage: 'VALIDATING',
        message: expect.stringContaining('destination'),
      });
    });
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
    expect(
      provisioningPolicy('new_connections', 'new_connections').signal_required,
    ).toBe(true);
  });

  it('offers only ONT replacement on fault tickets', () => {
    const fault = provisioningPolicy('fault', 'fault');
    expect(fault.actions).toEqual(['ONT_REPLACEMENT']);
    expect(fault.recommended).toEqual(['ONT_REPLACEMENT']);
    expect(fault.signal_required).toBe(false);
  });

  it('offers only relocation on relocation tickets', () => {
    const relocation = provisioningPolicy('relocation', 'relocation');
    expect(relocation.actions).toEqual(['RELOCATION']);
    expect(relocation.signal_required).toBe(false);
  });

  it('offers all four actions with the SR-type ones first', () => {
    expect(provisioningPolicy('new_connections', '').actions).toEqual([
      'NEW_CONNECTION',
      'SIGNAL_CHECK',
      'ONT_REPLACEMENT',
      'RELOCATION',
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
