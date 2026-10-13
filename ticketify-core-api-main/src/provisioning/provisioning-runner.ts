import { ProvisioningAction, ProvisioningStatus } from '@prisma/client';
import {
  IncaClient,
  IncaDevice,
  IncaOpticalInfo,
  IncaRejectedError,
  IncaSubscriber,
  IncaUnavailableError,
} from 'src/infrastructure/inca/inca.types';
import {
  classifySignal,
  OpticalRange,
  SignalResult,
} from './provisioning-policy';

export type RunInput = {
  action: ProvisioningAction;
  client_identifier: string;
  customer_name: string;
  ont_serial: string | null;
  service_area: string | null;
  device_type: string | null;
  package: string | null;
  address: string | null;
  pppoe_username: string | null;
  new_ont: boolean;
  /** OLT / PON confirmed by the technician after Detect, if any. */
  confirmed_olt_id?: string | null;
  confirmed_pon?: string | null;
};

/** Pre-change facts captured on the first attempt so a retry can verify against them. */
export type RunBaseline = {
  terminal_node_id?: string;
  old_ont_serial?: string | null;
  pppoe_username?: string;
  package?: string;
};

export type StageRecorder = {
  enter(status: ProvisioningStatus): Promise<void>;
  step(message: string, detail?: Record<string, unknown>): Promise<void>;
  saveBaseline(baseline: RunBaseline): Promise<void>;
};

export type OpticalReading = IncaOpticalInfo & { result: SignalResult };

export type RunOutcome = {
  result: Record<string, unknown>;
  ont_serial: string | null;
  old_ont_serial: string | null;
  installs_ont: boolean;
};

export class StageFailure extends Error {
  constructor(
    readonly stage: ProvisioningStatus,
    message: string,
    readonly unavailable = false,
  ) {
    super(message);
  }
}

export type RunnerConfig = {
  range: OpticalRange;
  todoTimeoutMs: number;
  todoPollMs: number;
};

/**
 * Executes the INCA sequence for one attempt. Every stage first reads the
 * live INCA state and only creates what is missing, so a retry after any
 * failure reconciles instead of duplicating subscribers or ONU bindings.
 */
export class ProvisioningRunner {
  private stage: ProvisioningStatus = 'VALIDATING';

  constructor(
    private readonly inca: IncaClient,
    private readonly recorder: StageRecorder,
    private readonly config: RunnerConfig,
  ) {}

  async run(
    input: RunInput,
    baseline: RunBaseline | null,
    pppoePassword: string | null,
  ): Promise<RunOutcome> {
    try {
      switch (input.action) {
        case 'NEW_CONNECTION':
          return await this.newConnection(input, pppoePassword);
        case 'ONT_REPLACEMENT':
          return await this.replacement(input, baseline);
        case 'RELOCATION':
          return await this.relocation(input, baseline);
        case 'SIGNAL_CHECK':
          return await this.signalCheck(input);
      }
    } catch (error) {
      if (error instanceof StageFailure) throw error;
      if (error instanceof IncaUnavailableError) {
        throw new StageFailure(
          this.stage,
          `INCA unavailable: ${error.message}`,
          true,
        );
      }
      if (error instanceof IncaRejectedError) {
        throw new StageFailure(this.stage, error.message);
      }
      throw new StageFailure(
        this.stage,
        'Unexpected error while talking to INCA',
      );
    }
  }

  async readSignal(serial: string): Promise<OpticalReading | null> {
    const reading = await this.inca.getOpticalInfo(serial);
    return reading
      ? { ...reading, result: classifySignal(reading, this.config.range) }
      : null;
  }

  private async newConnection(
    input: RunInput,
    pppoePassword: string | null,
  ): Promise<RunOutcome> {
    const serial = required(input.ont_serial, 'ONT serial');
    await this.enter('VALIDATING');
    const existing = await this.inca.findSubscriber(
      input.client_identifier,
      'new_connection',
    );
    const device = await this.inca.findDevice(serial);
    if (
      device?.terminal_node_id &&
      device.terminal_node_id !== existing?.terminal_node_id
    ) {
      this.fail(
        `ONT ${serial} is already registered to another customer (Terminal Node ${device.terminal_node_id}).`,
      );
    }
    if (existing && !existing.onu_serials.includes(serial)) {
      this.fail(
        `This customer already has an INCA subscriber (Terminal Node ${existing.terminal_node_id}). Use ONT replacement or relocation instead.`,
      );
    }
    await this.recorder.step('ONT serial and customer mapping validated', {
      ont_serial: serial,
    });

    await this.enter('REGISTERING_ONT');
    await this.ensureRegistered(serial, device, input);

    await this.enter('APPLYING_CONFIG');
    let subscriber = existing;
    if (subscriber) {
      await this.recorder.step(
        `Subscriber already exists on Terminal Node ${subscriber.terminal_node_id}; reused`,
      );
    } else {
      subscriber = await this.inca.createSubscriber({
        client_identifier: input.client_identifier,
        name: input.customer_name,
        address: input.address,
        service_area: required(input.service_area, 'Service area'),
        onu_serial: serial,
        package: required(input.package, 'Package'),
        pppoe_username: required(input.pppoe_username, 'PPPoE username'),
        pppoe_password: pppoePassword,
      });
      await this.recorder.step(
        'Simple Subscriber Registration submitted: PPPoE ON, Radius applied, Connected',
        {
          terminal_node_id: subscriber.terminal_node_id,
        },
      );
    }

    await this.waitForTodo(subscriber.terminal_node_id);

    await this.enter('VERIFYING');
    const live = await this.mustGetSubscriber(subscriber.terminal_node_id);
    if (!live.onu_serials.includes(serial))
      this.fail(`ONT ${serial} is not attached to the new Terminal Node.`);
    if (!live.pppoe_enabled || !live.connected)
      this.fail('Subscriber is not connected or PPPoE is off.');
    const optical = await this.requireOnline(serial);
    await this.recorder.step(
      'Active device, Terminal Node, PPPoE and optical info verified',
      { rx_dbm: optical.rx_dbm },
    );

    return {
      result: this.summary(live, serial, optical, { pppoe_verified: true }),
      ont_serial: serial,
      old_ont_serial: null,
      installs_ont: true,
    };
  }

  private async replacement(
    input: RunInput,
    baseline: RunBaseline | null,
  ): Promise<RunOutcome> {
    const serial = required(input.ont_serial, 'Replacement ONT serial');
    await this.enter('VALIDATING');
    const subscriber = await this.existingSubscriber(input, baseline);
    const oldSerial =
      baseline?.old_ont_serial !== undefined
        ? baseline.old_ont_serial
        : subscriber.onu_serials.find((value) => value !== serial) ?? null;
    if (
      !baseline &&
      subscriber.onu_serials.length === 1 &&
      subscriber.onu_serials[0] === serial
    ) {
      this.fail(`ONT ${serial} is already the installed ONT on this customer.`);
    }
    const device = await this.inca.findDevice(serial);
    if (
      device?.terminal_node_id &&
      device.terminal_node_id !== subscriber.terminal_node_id
    ) {
      this.fail(
        `ONT ${serial} is bound to another Terminal Node (${device.terminal_node_id}).`,
      );
    }
    const base = await this.captureBaseline(baseline, subscriber, oldSerial);
    await this.recorder.step(
      `Existing Terminal Node ${subscriber.terminal_node_id} confirmed; old ONT ${oldSerial ?? 'none'}`,
    );

    await this.enter('REGISTERING_ONT');
    await this.ensureRegistered(serial, device, {
      ...input,
      service_area: input.service_area ?? subscriber.service_area,
    });

    await this.enter('APPLYING_CONFIG');
    await this.swapOnu(subscriber, oldSerial, serial);

    await this.waitForTodo(subscriber.terminal_node_id);

    await this.enter('VERIFYING');
    const live = await this.mustGetSubscriber(subscriber.terminal_node_id);
    if (!live.onu_serials.includes(serial))
      this.fail(`Replacement ONT ${serial} is not attached.`);
    if (oldSerial && live.onu_serials.includes(oldSerial))
      this.fail(`Old ONT ${oldSerial} is still attached.`);
    this.assertRetained(live, base);
    const optical = await this.requireOnline(serial);
    await this.recorder.step(
      'Replacement verified: same subscriber, PPPoE and package retained, service online',
    );

    return {
      result: this.summary(live, serial, optical, {
        pppoe_verified: true,
        old_ont_serial: oldSerial,
        recovered_ont_serial: oldSerial,
      }),
      ont_serial: serial,
      old_ont_serial: oldSerial,
      installs_ont: true,
    };
  }

  private async relocation(
    input: RunInput,
    baseline: RunBaseline | null,
  ): Promise<RunOutcome> {
    const area = required(input.service_area, 'Destination service area');
    await this.enter('VALIDATING');
    const subscriber = await this.existingSubscriber(input, baseline);
    const current =
      baseline?.old_ont_serial !== undefined
        ? baseline.old_ont_serial
        : subscriber.onu_serials[0] ?? null;
    const target = input.new_ont
      ? required(input.ont_serial, 'New ONT serial')
      : current;
    if (!target)
      this.fail(
        'No ONT is attached to this customer. Enter the ONT serial installed at the new location.',
      );
    if (input.new_ont && target === current && !baseline) {
      this.fail(
        `ONT ${target} is the existing ONT. Turn off "new ONT" or scan the new device.`,
      );
    }
    const device = await this.inca.findDevice(target);
    if (
      device?.terminal_node_id &&
      device.terminal_node_id !== subscriber.terminal_node_id
    ) {
      this.fail(
        `ONT ${target} is bound to another Terminal Node (${device.terminal_node_id}).`,
      );
    }
    const base = await this.captureBaseline(baseline, subscriber, current);
    await this.recorder.step(
      `Existing Terminal Node ${subscriber.terminal_node_id} verified; current ONT ${current ?? 'none'}`,
    );

    await this.enter('REGISTERING_ONT');
    let destination: { olt_id: string; pon: string };
    if (input.new_ont) {
      const registered = await this.ensureRegistered(target, device, {
        ...input,
        service_area: area,
      });
      destination = {
        olt_id: registered.olt_id ?? '',
        pon: registered.pon ?? '',
      };
    } else {
      const detected = await this.inca.detectUnregistered(target);
      if (detected) this.assertConfirmedLocation(detected, input);
      destination = detected ?? {
        olt_id: device?.olt_id ?? subscriber.olt_id ?? '',
        pon: device?.pon ?? subscriber.pon ?? '',
      };
      await this.recorder.step(
        `Existing ONT detected at destination: ${destination.olt_id} PON ${destination.pon}`,
      );
    }

    await this.enter('APPLYING_CONFIG');
    const alreadyMoved =
      subscriber.service_area === area &&
      subscriber.olt_id === destination.olt_id &&
      subscriber.pon === destination.pon;
    if (alreadyMoved) {
      await this.recorder.step(
        'Terminal Node location already updated; skipped',
      );
    } else {
      await this.inca.updateLocation(subscriber.terminal_node_id, {
        service_area: area,
        address: input.address,
        olt_id: destination.olt_id,
        pon: destination.pon,
      });
      await this.recorder.step(
        `Terminal Node location updated to ${area} (no new subscriber created)`,
      );
    }
    if (input.new_ont) {
      await this.swapOnu(
        await this.mustGetSubscriber(subscriber.terminal_node_id),
        current,
        target,
      );
    } else if (
      !(
        await this.mustGetSubscriber(subscriber.terminal_node_id)
      ).onu_serials.includes(target)
    ) {
      await this.inca.addOnu(subscriber.terminal_node_id, target);
      await this.recorder.step(`ONU ${target} rebound to the same customer`);
    } else {
      await this.recorder.step(
        'Existing ONU binding is valid; no rebind needed',
      );
    }

    await this.waitForTodo(subscriber.terminal_node_id);

    await this.enter('VERIFYING');
    const live = await this.mustGetSubscriber(subscriber.terminal_node_id);
    if (live.service_area !== area)
      this.fail('Service area did not update in INCA.');
    if (!live.onu_serials.includes(target))
      this.fail(`ONT ${target} is not attached after relocation.`);
    this.assertRetained(live, base);
    const optical = await this.requireOnline(target);
    await this.recorder.step(
      'Destination OLT, service area, ONU and optical info verified',
    );

    return {
      result: this.summary(live, target, optical, {
        pppoe_verified: true,
        old_ont_serial: input.new_ont ? current : null,
        new_ont: input.new_ont,
      }),
      ont_serial: target,
      old_ont_serial: input.new_ont ? current : null,
      installs_ont: input.new_ont,
    };
  }

  private async signalCheck(input: RunInput): Promise<RunOutcome> {
    await this.enter('VALIDATING');
    const subscriber = await this.existingSubscriber(input, null);
    const attached = subscriber.onu_serials;
    const serial = input.ont_serial ?? attached[0];
    if (!serial) this.fail('No ONT is attached to this customer in INCA.');
    if (!attached.includes(serial)) {
      this.fail(
        `ONT ${serial} is not attached to this customer (attached: ${attached.join(', ') || 'none'}).`,
      );
    }
    await this.recorder.step(
      `ONT ${serial} confirmed on Terminal Node ${subscriber.terminal_node_id}`,
    );

    await this.enter('VERIFYING');
    const before = await this.readSignal(serial);
    await this.recorder.step(
      before
        ? `Before reading: ${before.rx_dbm ?? 'n/a'} dBm`
        : 'No optical reading available',
      {
        rx_dbm: before?.rx_dbm ?? null,
        alarms: before?.alarms ?? [],
      },
    );
    return {
      result: {
        terminal_node_id: subscriber.terminal_node_id,
        ont_serial: serial,
        olt_id: subscriber.olt_id,
        pon: subscriber.pon,
        package: subscriber.package,
        range: this.config.range,
        before,
        after: null,
        action_taken: null,
        signal_result: before?.result ?? 'NO_READING',
      },
      ont_serial: serial,
      old_ont_serial: null,
      installs_ont: false,
    };
  }

  private async existingSubscriber(
    input: RunInput,
    baseline: RunBaseline | null,
  ): Promise<IncaSubscriber> {
    const subscriber = baseline?.terminal_node_id
      ? await this.inca.getSubscriber(baseline.terminal_node_id)
      : await this.inca.findSubscriber(
          input.client_identifier,
          'existing_service',
        );
    if (!subscriber)
      this.fail('Customer mapping not found in INCA for this Service Request.');
    return subscriber;
  }

  private async captureBaseline(
    baseline: RunBaseline | null,
    subscriber: IncaSubscriber,
    oldSerial: string | null,
  ): Promise<Required<RunBaseline>> {
    if (
      baseline?.terminal_node_id &&
      baseline.pppoe_username &&
      baseline.package
    ) {
      return {
        terminal_node_id: baseline.terminal_node_id,
        old_ont_serial: baseline.old_ont_serial ?? null,
        pppoe_username: baseline.pppoe_username,
        package: baseline.package,
      };
    }
    const fresh = {
      terminal_node_id: subscriber.terminal_node_id,
      old_ont_serial: oldSerial,
      pppoe_username: subscriber.pppoe_username,
      package: subscriber.package,
    };
    await this.recorder.saveBaseline(fresh);
    return fresh;
  }

  private async ensureRegistered(
    serial: string,
    device: IncaDevice | null,
    input: RunInput,
  ): Promise<IncaDevice> {
    if (device?.registered) {
      await this.recorder.step(
        `ONT already registered on ${device.olt_id} PON ${device.pon}; reused`,
      );
      return device;
    }
    const detected = await this.inca.detectUnregistered(serial);
    if (!detected) {
      this.fail(
        `ONT ${serial} is not detected on any OLT. Check power and fibre, then retry.`,
      );
    }
    this.assertConfirmedLocation(detected, input);
    const registered = await this.inca.registerOnt({
      serial,
      service_area: required(input.service_area, 'Service area'),
      device_type: required(input.device_type, 'Device type'),
      olt_id: detected.olt_id,
      pon: detected.pon,
    });
    await this.recorder.step(
      `ONT registered on ${registered.olt_id} PON ${registered.pon}`,
      {
        olt_id: registered.olt_id,
        pon: registered.pon,
      },
    );
    return registered;
  }

  private assertConfirmedLocation(
    detected: { olt_id: string; pon: string },
    input: RunInput,
  ) {
    if (!input.confirmed_olt_id) return;
    if (
      detected.olt_id !== input.confirmed_olt_id ||
      (input.confirmed_pon && detected.pon !== input.confirmed_pon)
    ) {
      this.fail(
        `ONT is now detected on ${detected.olt_id} PON ${detected.pon}, not the confirmed ${input.confirmed_olt_id} PON ${input.confirmed_pon ?? '-'}. Detect again, confirm, and start a new run.`,
      );
    }
  }

  private async swapOnu(
    subscriber: IncaSubscriber,
    oldSerial: string | null,
    newSerial: string,
  ) {
    if (
      oldSerial &&
      oldSerial !== newSerial &&
      subscriber.onu_serials.includes(oldSerial)
    ) {
      await this.inca.revokeOnu(subscriber.terminal_node_id, oldSerial);
      await this.recorder.step(`Old ONU ${oldSerial} revoked`);
    } else {
      await this.recorder.step('Old ONU already revoked; skipped');
    }
    const refreshed = await this.mustGetSubscriber(subscriber.terminal_node_id);
    if (refreshed.onu_serials.includes(newSerial)) {
      await this.recorder.step(`ONU ${newSerial} already attached; skipped`);
    } else {
      await this.inca.addOnu(subscriber.terminal_node_id, newSerial);
      await this.recorder.step(
        `ONU ${newSerial} added to Terminal Node ${subscriber.terminal_node_id}`,
      );
    }
  }

  private async waitForTodo(terminalNodeId: string) {
    await this.enter('WAITING_TODO');
    const deadline = Date.now() + this.config.todoTimeoutMs;
    for (;;) {
      const todos = await this.inca.listTodo(terminalNodeId);
      const failed = todos.find((todo) => todo.status === 'FAILED');
      if (failed)
        this.fail(
          `INCA Todo ${failed.type} failed${failed.message ? `: ${failed.message}` : ''}.`,
        );
      const pending = todos.filter((todo) => todo.status === 'PENDING');
      if (!pending.length) {
        await this.recorder.step('INCA Todo completed', {
          tasks: todos.map((todo) => todo.type),
        });
        return;
      }
      if (Date.now() >= deadline) {
        this.fail(
          `INCA Todo timeout: ${pending.map((todo) => todo.type).join(', ')} still pending.`,
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.todoPollMs),
      );
    }
  }

  private async requireOnline(serial: string): Promise<OpticalReading> {
    const optical = await this.readSignal(serial);
    if (!optical || !optical.online || optical.rx_dbm === null) {
      this.fail(
        'Optical verification unavailable: the ONT is not online or returned no reading.',
      );
    }
    return optical;
  }

  private assertRetained(live: IncaSubscriber, base: Required<RunBaseline>) {
    if (live.pppoe_username !== base.pppoe_username || !live.pppoe_enabled) {
      this.fail('PPPoE/Radius configuration was not retained.');
    }
    if (live.package !== base.package) {
      this.fail('Package changed unexpectedly.');
    }
  }

  private async mustGetSubscriber(terminalNodeId: string) {
    const subscriber = await this.inca.getSubscriber(terminalNodeId);
    if (!subscriber)
      this.fail(`Terminal Node ${terminalNodeId} not found in INCA.`);
    return subscriber;
  }

  private summary(
    live: IncaSubscriber,
    serial: string,
    optical: OpticalReading,
    extra: Record<string, unknown>,
  ) {
    return {
      terminal_node_id: live.terminal_node_id,
      ont_serial: serial,
      olt_id: live.olt_id,
      pon: live.pon,
      service_area: live.service_area,
      package: live.package,
      pppoe_username: live.pppoe_username,
      connected: live.connected,
      optical,
      range: this.config.range,
      ...extra,
    };
  }

  private async enter(status: ProvisioningStatus) {
    this.stage = status;
    await this.recorder.enter(status);
  }

  private fail(message: string): never {
    throw new StageFailure(this.stage, message);
  }
}

function required(value: string | null | undefined, label: string): string {
  if (!value?.trim()) {
    throw new IncaRejectedError(`${label} is required`);
  }
  return value.trim();
}
