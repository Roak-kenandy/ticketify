import { ProvisioningAction, ProvisioningStatus } from '@prisma/client';
import {
  IncaClient,
  IncaDevice,
  IncaLocationInput,
  IncaNotIntegratedError,
  IncaOpticalInfo,
  IncaRejectedError,
  IncaSubscriber,
  IncaTerminalNodeInput,
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
  /** Replacement: serial of the ONT being replaced; locates the customer's Terminal Node. */
  old_ont_serial?: string | null;
  service_area: string | null;
  device_type: string | null;
  package: string | null;
  address: string | null;
  pppoe_username: string | null;
  new_ont: boolean;
  /** OLT / PON confirmed by the technician after Detect, if any. */
  confirmed_olt_id?: string | null;
  confirmed_pon?: string | null;
  /** New connection: the INCA Terminal Node to create. */
  terminal_node?: IncaTerminalNodeInput | null;
  /** Relocation: the destination address. */
  location?: IncaLocationInput | null;
};

/** Pre-change facts captured on the first attempt so a retry can verify against them. */
export type RunBaseline = {
  terminal_node_id?: string;
  old_ont_serial?: string | null;
  pppoe_username?: string;
  package?: string;
  /**
   * New connection: the ONT needs PPPoE (operator firmware). Kept because the OLT stops
   * reporting the firmware once the ONT leaves the autofind list.
   */
  pppoe_required?: boolean;
  /** Relocation: the address before the move, for the result after a retry. */
  previous_address?: string | null;
};

export type StageRecorder = {
  enter(status: ProvisioningStatus): Promise<void>;
  step(message: string, detail?: Record<string, unknown>): Promise<void>;
  saveBaseline(baseline: RunBaseline): Promise<void>;
};

export type OpticalReading = IncaOpticalInfo & { result: SignalResult };

type PppoePlan = { username: string; password: string | null };

/** What a replacement or relocation must leave unchanged on the Terminal Node. */
type ServiceBaseline = Required<
  Omit<RunBaseline, 'pppoe_required' | 'previous_address'>
>;

type RelocationDestination = {
  olt_id: string;
  olt_name: string | null;
  pon: string | null;
  /** The ONT is (re)added on this port rather than kept on its current binding. */
  rebind: boolean;
};

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
  /** An ONT is only registered on, or moved to, an OLT / PON the technician confirmed. */
  requireOltConfirmation?: boolean;
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
          return await this.newConnection(input, baseline, pppoePassword);
        case 'ONT_REPLACEMENT':
          return await this.replacement(input, baseline, pppoePassword);
        case 'RELOCATION':
          return await this.relocation(input, baseline, pppoePassword);
        case 'SIGNAL_CHECK':
          return await this.signalCheck(input);
      }
    } catch (error) {
      if (error instanceof StageFailure) throw error;
      if (error instanceof IncaNotIntegratedError) {
        throw new StageFailure(this.stage, `${error.message}.`, true);
      }
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
    baseline: RunBaseline | null,
    pppoePassword: string | null,
  ): Promise<RunOutcome> {
    const serial = required(input.ont_serial, 'ONT serial');
    await this.enter('VALIDATING');
    let existing = await this.inca.findSubscriber(
      input.client_identifier,
      'new_connection',
    );
    const device = await this.inca.findDevice(serial);
    if (
      device?.terminal_node_id &&
      device.terminal_node_id !== existing?.terminal_node_id
    ) {
      const bound = existing
        ? null
        : await this.inca.getSubscriber(device.terminal_node_id);
      const identity = input.terminal_node?.client_identity
        .trim()
        .toUpperCase();
      if (
        !bound ||
        !identity ||
        bound.client_identifier.trim().toUpperCase() !== identity
      ) {
        this.fail(
          `ONT ${serial} is already registered to another customer (Terminal Node ${device.terminal_node_id}).`,
        );
      }
      existing = bound;
      await this.recorder.step(
        `ONT ${serial} is already on this customer's Terminal Node ${bound.terminal_node_id}; resuming`,
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
    const pppoe = await this.pppoePlan(serial, input, baseline, pppoePassword);

    await this.enter('REGISTERING_ONT');
    await this.ensureRegistered(serial, device, input);

    await this.enter('APPLYING_CONFIG');
    let subscriber = existing;
    if (subscriber) {
      await this.recorder.step(
        `Subscriber already exists on Terminal Node ${subscriber.terminal_node_id}; reused`,
      );
    } else {
      const { notes, ...created } = await this.inca.createSubscriber({
        client_identifier: input.client_identifier,
        name: input.customer_name,
        address: input.address,
        // Demanded at start whenever INCA offers choices for them.
        service_area: input.service_area ?? '',
        onu_serial: serial,
        package: input.package ?? '',
        pppoe_username: input.pppoe_username ?? '',
        pppoe_password: pppoePassword,
        terminal_node: input.terminal_node ?? null,
      });
      subscriber = created;
      for (const note of notes ?? []) {
        await this.recorder.step(note, {
          terminal_node_id: subscriber.terminal_node_id,
        });
      }
      if (!notes?.length) {
        await this.recorder.step(
          `Terminal Node ${subscriber.terminal_node_id} created`,
          {
            terminal_node_id: subscriber.terminal_node_id,
          },
        );
      }
    }
    const nodeId = subscriber.terminal_node_id;
    // Before the ONU: INCA builds the ONT's WAN configuration from the node's PPPoE.
    if (pppoe) await this.ensurePppoe(nodeId, pppoe);
    if (subscriber.onu_serials.includes(serial)) {
      await this.recorder.step(`ONU ${serial} already attached; skipped`);
    } else {
      await this.inca.addOnu(nodeId, serial);
      await this.recorder.step(
        `ONU ${serial} attached to Terminal Node ${nodeId}`,
      );
    }
    if (input.package) {
      const pkg = await this.inca.assignPackage(nodeId, input.package);
      await this.recorder.step(
        pkg.changed
          ? `Package ${pkg.label} assigned`
          : `Package ${pkg.label} already assigned; skipped`,
      );
    }
    const status = await this.inca.markConnected(nodeId);
    await this.recorder.step(
      status.changed
        ? 'Terminal Node status set to Connected'
        : 'Terminal Node status already Connected; skipped',
    );

    await this.waitForTodo(nodeId);

    await this.enter('VERIFYING');
    const live = await this.mustGetSubscriber(nodeId);
    if (!live.onu_serials.includes(serial))
      this.fail(`ONT ${serial} is not attached to the new Terminal Node.`);
    if (!live.connected)
      this.fail(`Terminal Node ${nodeId} status is not Connected in INCA.`);
    this.assertPppoe(live, pppoe);
    const optical = await this.waitForOptical(serial);
    await this.recorder.step(
      `Optical info received: ONT Rx ${optical.rx_dbm} dBm, OLT Rx ${optical.olt_rx_dbm ?? 'n/a'} dBm`,
      { rx_dbm: optical.rx_dbm, details: optical.details ?? [] },
    );

    return {
      result: this.summary(live, serial, optical, {
        pppoe_verified: pppoe ? true : live.pppoe_enabled,
        pppoe_required: Boolean(pppoe),
      }),
      ont_serial: serial,
      old_ont_serial: null,
      installs_ont: true,
    };
  }

  private async replacement(
    input: RunInput,
    baseline: RunBaseline | null,
    pppoePassword: string | null,
  ): Promise<RunOutcome> {
    const serial = required(input.ont_serial, 'Replacement ONT serial');
    await this.enter('VALIDATING');
    const given = input.old_ont_serial?.trim().toUpperCase() || null;
    const subscriber = await this.replacementSubscriber(input, given, baseline);
    const oldSerial =
      baseline?.old_ont_serial !== undefined
        ? baseline.old_ont_serial
        : given ??
          subscriber.onu_serials.find((value) => value !== serial) ??
          null;
    if (!baseline) {
      if (oldSerial === serial) {
        this.fail(
          `ONT ${serial} is the current ONT. Scan the new ONT as the replacement.`,
        );
      }
      if (
        subscriber.onu_serials.length === 1 &&
        subscriber.onu_serials[0] === serial
      ) {
        this.fail(
          `ONT ${serial} is already the installed ONT on this customer.`,
        );
      }
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
      `Terminal Node ${subscriber.terminal_node_id} found; current ONT ${oldSerial ?? 'none'}`,
      { terminal_node_id: subscriber.terminal_node_id },
    );
    const pppoe = await this.pppoePlan(
      serial,
      input,
      { ...base, pppoe_required: baseline?.pppoe_required },
      pppoePassword,
      subscriber.pppoe_configured === true,
    );

    await this.enter('REGISTERING_ONT');
    await this.ensureRegistered(serial, device, {
      ...input,
      service_area: input.service_area ?? subscriber.service_area,
    });

    await this.enter('APPLYING_CONFIG');
    const nodeId = subscriber.terminal_node_id;
    if (oldSerial && subscriber.onu_serials.includes(oldSerial)) {
      await this.inca.revokeOnu(nodeId, oldSerial);
      await this.recorder.step(
        `Old ONU ${oldSerial} revoked from Terminal Node ${nodeId}`,
      );
      await this.recorder.step('Waiting for INCA to remove it from the OLT');
      await this.pollTodos(nodeId);
    } else {
      await this.recorder.step('Old ONU already revoked; skipped');
    }
    if (pppoe) await this.ensurePppoe(nodeId, pppoe);
    const refreshed = await this.mustGetSubscriber(nodeId);
    if (refreshed.onu_serials.includes(serial)) {
      await this.recorder.step(`ONU ${serial} already attached; skipped`);
    } else {
      await this.inca.addOnu(nodeId, serial);
      await this.recorder.step(
        `ONU ${serial} added to Terminal Node ${nodeId}`,
      );
    }

    await this.waitForTodo(nodeId);

    await this.enter('VERIFYING');
    const live = await this.mustGetSubscriber(nodeId);
    if (!live.onu_serials.includes(serial))
      this.fail(`Replacement ONT ${serial} is not attached.`);
    if (oldSerial && live.onu_serials.includes(oldSerial))
      this.fail(`Old ONT ${oldSerial} is still attached.`);
    this.assertRetained(live, base, Boolean(pppoe));
    this.assertPppoe(live, pppoe);
    const optical = await this.waitForOptical(serial);
    await this.recorder.step(
      `Replacement verified: same Terminal Node and package; optical info ONT Rx ${optical.rx_dbm} dBm, OLT Rx ${optical.olt_rx_dbm ?? 'n/a'} dBm`,
      { rx_dbm: optical.rx_dbm, details: optical.details ?? [] },
    );

    return {
      result: this.summary(live, serial, optical, {
        pppoe_verified: pppoe ? true : live.pppoe_enabled,
        pppoe_required: Boolean(pppoe),
        old_ont_serial: oldSerial,
        recovered_ont_serial: oldSerial,
      }),
      ont_serial: serial,
      old_ont_serial: oldSerial,
      installs_ont: true,
    };
  }

  /**
   * Same customer and Terminal Node at a new address. Where the ONT is seen decides the
   * rest: still configured on its OLT port = address only; on the destination's autofind
   * list = revoke, point its INCA record at that OLT and add it again; a new ONT = the
   * replacement sequence.
   */
  private async relocation(
    input: RunInput,
    baseline: RunBaseline | null,
    pppoePassword: string | null,
  ): Promise<RunOutcome> {
    await this.enter('VALIDATING');
    const location = input.location;
    if (!location) this.fail('Choose the destination city, street and number.');
    const given = input.old_ont_serial?.trim().toUpperCase() || null;
    const subscriber = await this.replacementSubscriber(input, given, baseline);
    const current =
      baseline?.old_ont_serial !== undefined
        ? baseline.old_ont_serial
        : given ?? subscriber.onu_serials[0] ?? null;
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
    const previousAddress =
      baseline?.previous_address !== undefined
        ? baseline.previous_address
        : subscriber.address;
    const saved: RunBaseline = {
      ...base,
      previous_address: previousAddress,
      pppoe_required: baseline?.pppoe_required,
    };
    if (!baseline) await this.recorder.saveBaseline(saved);
    const nodeId = subscriber.terminal_node_id;
    await this.recorder.step(
      `Existing Terminal Node ${nodeId} verified; current ONT ${current ?? 'none'} at ${previousAddress ?? 'an unknown address'}`,
      { terminal_node_id: nodeId },
    );
    const pppoe = input.new_ont
      ? await this.pppoePlan(
          target,
          input,
          saved,
          pppoePassword,
          subscriber.pppoe_configured === true,
        )
      : null;

    await this.enter('REGISTERING_ONT');
    const destination = input.new_ont
      ? await this.newOntDestination(target, device, input, subscriber)
      : await this.sameOntDestination(target, input);
    const where = `${destination.olt_name ?? destination.olt_id} PON ${destination.pon ?? '-'}`;

    await this.enter('APPLYING_CONFIG');
    const moved = await this.inca.updateLocation(nodeId, location);
    for (const note of moved.notes) await this.recorder.step(note);
    await this.recorder.step(
      moved.changed
        ? `Terminal Node ${nodeId} moved to ${moved.address} (no new subscriber created)`
        : `Terminal Node ${nodeId} already at ${moved.address}; skipped`,
    );
    if (input.new_ont) {
      await this.revokeIfAttached(nodeId, current);
      if (pppoe) await this.ensurePppoe(nodeId, pppoe);
      await this.moveToOlt(target, destination.olt_id);
      await this.addIfMissing(nodeId, target);
    } else if (destination.rebind) {
      await this.revokeIfAttached(nodeId, target);
      await this.moveToOlt(target, destination.olt_id);
      await this.addIfMissing(nodeId, target);
    } else if (
      (await this.mustGetSubscriber(nodeId)).onu_serials.includes(target)
    ) {
      await this.recorder.step(
        `ONU ${target} binding is still valid on ${where}; no rebind needed`,
      );
    } else {
      this.fail(
        `ONT ${target} is configured on ${where} but not on this customer's Terminal Node. If INCA is still removing it, wait for the Todo and retry; otherwise ask the NOC to remove it from the OLT.`,
      );
    }

    await this.waitForTodo(nodeId);

    await this.enter('VERIFYING');
    const live = await this.mustGetSubscriber(nodeId);
    if (!live.onu_serials.includes(target))
      this.fail(`ONT ${target} is not attached after relocation.`);
    if (input.new_ont && current && live.onu_serials.includes(current))
      this.fail(`Old ONT ${current} is still attached.`);
    if (
      live.location &&
      (live.location.city_id !== moved.location.city_id ||
        live.location.street_id !== moved.location.street_id ||
        live.location.number !== moved.location.number)
    ) {
      this.fail('The Terminal Node address did not update in INCA.');
    }
    this.assertRetained(live, base, Boolean(pppoe));
    this.assertPppoe(live, pppoe);
    if (input.new_ont || destination.rebind) {
      const record = await this.inca.findDevice(target);
      if (record?.olt_id && record.olt_id !== destination.olt_id) {
        this.fail(
          `ONT ${target} is on OLT ${record.olt_id} in INCA, not the destination ${destination.olt_id}.`,
        );
      }
    }
    const optical = await this.waitForOptical(target);
    await this.recorder.step(
      `Relocation verified: same Terminal Node, package and PPPoE at ${moved.address} on ${where}; optical info ONT Rx ${optical.rx_dbm} dBm`,
      { rx_dbm: optical.rx_dbm, details: optical.details ?? [] },
    );

    return {
      result: this.summary(live, target, optical, {
        address: moved.address,
        previous_address: previousAddress,
        olt_id: destination.olt_id,
        olt_name: destination.olt_name,
        pon: destination.pon,
        rebound: input.new_ont || destination.rebind,
        pppoe_verified: pppoe ? true : live.pppoe_enabled,
        pppoe_required: Boolean(pppoe),
        old_ont_serial: input.new_ont ? current : null,
        recovered_ont_serial: input.new_ont ? current : null,
        new_ont: input.new_ont,
      }),
      ont_serial: target,
      old_ont_serial: input.new_ont ? current : null,
      installs_ont: input.new_ont,
    };
  }

  /** New ONT: registered from the destination's autofind list (or its record reused). */
  private async newOntDestination(
    serial: string,
    device: IncaDevice | null,
    input: RunInput,
    subscriber: IncaSubscriber,
  ): Promise<RelocationDestination> {
    const registered = await this.ensureRegistered(serial, device, {
      ...input,
      service_area: input.service_area ?? subscriber.service_area,
    });
    const seen = device?.registered
      ? await this.inca.detectOnOlt(serial)
      : null;
    if (seen?.olt_state === 'UNREGISTERED') {
      this.assertConfirmedLocation(seen, input);
      return {
        olt_id: seen.olt_id,
        olt_name: seen.olt_name ?? null,
        pon: seen.pon || null,
        rebind: true,
      };
    }
    return {
      olt_id: registered.olt_id ?? '',
      olt_name: registered.olt_name ?? null,
      pon: registered.pon,
      rebind: true,
    };
  }

  /**
   * Same ONT: on the OLT's registered list it is still on its old port (same PON); on the
   * autofind list it has moved to a new PON or OLT and must be re-added there.
   */
  private async sameOntDestination(
    serial: string,
    input: RunInput,
  ): Promise<RelocationDestination> {
    const detected = await this.inca.detectOnOlt(serial);
    if (!detected) {
      this.fail(
        `ONT ${serial} is not seen on any OLT at the destination. Check power and fibre, then retry.`,
      );
    }
    const rebind = detected.olt_state === 'UNREGISTERED';
    this.assertConfirmedLocation(detected, input, rebind);
    const where = `${detected.olt_name ?? detected.olt_id} PON ${detected.pon || '-'}`;
    if (!rebind && detected.online === false) {
      this.fail(
        `ONT ${serial} is still configured on ${where} but offline. If it was moved to another PON, check it is powered and connected there: INCA then lists it as unregistered.`,
      );
    }
    await this.recorder.step(
      rebind
        ? `ONT ${serial} is new on ${where}: it will be moved to that port`
        : `ONT ${serial} is still on ${where}: same PON`,
      { olt_id: detected.olt_id, pon: detected.pon },
    );
    return {
      olt_id: detected.olt_id,
      olt_name: detected.olt_name ?? null,
      pon: detected.pon || null,
      rebind,
    };
  }

  private async revokeIfAttached(nodeId: string, serial: string | null) {
    const attached = (await this.mustGetSubscriber(nodeId)).onu_serials;
    if (!serial || !attached.includes(serial)) {
      await this.recorder.step(
        serial
          ? `ONU ${serial} already revoked; skipped`
          : 'No old ONU to revoke',
      );
      return;
    }
    await this.inca.revokeOnu(nodeId, serial);
    await this.recorder.step(
      `ONU ${serial} revoked from Terminal Node ${nodeId}`,
    );
    await this.recorder.step('Waiting for INCA to remove it from the OLT');
    await this.pollTodos(nodeId);
  }

  private async moveToOlt(serial: string, oltId: string) {
    if (!oltId) return;
    const { changed } = await this.inca.moveDevice(serial, oltId);
    if (changed)
      await this.recorder.step(
        `ONT ${serial} record moved to OLT ${oltId} in INCA`,
      );
  }

  private async addIfMissing(nodeId: string, serial: string) {
    if ((await this.mustGetSubscriber(nodeId)).onu_serials.includes(serial)) {
      await this.recorder.step(`ONU ${serial} already attached; skipped`);
      return;
    }
    await this.inca.addOnu(nodeId, serial);
    await this.recorder.step(`ONU ${serial} added to Terminal Node ${nodeId}`);
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

  /**
   * Replacement locates the node by the ONT being replaced; after the first attempt the
   * baseline node is used, because that serial is gone once the old ONU is revoked.
   */
  private async replacementSubscriber(
    input: RunInput,
    oldSerial: string | null,
    baseline: RunBaseline | null,
  ): Promise<IncaSubscriber> {
    if (baseline?.terminal_node_id || !oldSerial) {
      return this.existingSubscriber(input, baseline);
    }
    const subscriber = await this.inca.findSubscriberBySerial(oldSerial);
    if (!subscriber) {
      this.fail(
        `ONT ${oldSerial} is not attached to any Terminal Node in INCA. Check the current ONT serial.`,
      );
    }
    return subscriber;
  }

  private async captureBaseline(
    baseline: RunBaseline | null,
    subscriber: IncaSubscriber,
    oldSerial: string | null,
  ): Promise<ServiceBaseline> {
    if (baseline?.terminal_node_id) {
      return {
        terminal_node_id: baseline.terminal_node_id,
        old_ont_serial: baseline.old_ont_serial ?? null,
        pppoe_username: baseline.pppoe_username ?? '',
        package: baseline.package ?? '',
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
        `ONT already registered on ${device.olt_name ?? device.olt_id} PON ${device.pon ?? '-'}; reused`,
      );
      return device;
    }
    const detected = await this.inca.detectOnOlt(serial);
    if (!detected) {
      this.fail(
        `ONT ${serial} is not detected on any OLT (registered or unregistered). Check power and fibre, then retry.`,
      );
    }
    if (detected.olt_state === 'REGISTERED') {
      this.fail(
        `ONT ${serial} is still configured on ${detected.olt_name ?? detected.olt_id} PON ${detected.pon || '-'} (OLT registered list) without an INCA record. INCA only adds ONTs from the autofind list: have the NOC remove it from the OLT, then detect again.`,
      );
    }
    this.assertConfirmedLocation(detected, input, true);
    const registered = await this.inca.registerOnt({
      serial,
      service_area: input.service_area ?? '',
      device_type: required(input.device_type, 'Device type'),
      olt_id: detected.olt_id,
      olt_name: detected.olt_name ?? null,
      pon: detected.pon,
    });
    await this.recorder.step(
      `ONT registered on ${registered.olt_name ?? registered.olt_id} PON ${registered.pon ?? '-'}`,
      {
        olt_id: registered.olt_id,
        olt_name: registered.olt_name ?? null,
        pon: registered.pon,
      },
    );
    return registered;
  }

  /**
   * Operator-firmware ONTs (Ooredoo) only get service over PPPoE, so the credentials are
   * demanded before anything is written to INCA, unless the node already has PPPoE. The
   * password is never stored: a retry needs it again unless PPPoE was already set.
   */
  private async pppoePlan(
    serial: string,
    input: RunInput,
    baseline: RunBaseline | null,
    password: string | null,
    nodeHasPppoe = false,
  ): Promise<PppoePlan | null> {
    const known = baseline?.pppoe_required === true;
    if (!known) {
      const onOlt = await this.inca.detectOnOlt(serial);
      if (!onOlt?.pppoe_required) return null;
      await this.recorder.saveBaseline({
        ...(baseline ?? {}),
        pppoe_required: true,
      });
      await this.recorder.step(
        `ONT ${serial} has ${onOlt.operator ?? 'operator'} firmware: PPPoE is required`,
      );
    }
    if (nodeHasPppoe) {
      await this.recorder.step(
        "PPPoE already set on the customer's Terminal Node; kept",
      );
      return null;
    }
    const username = input.pppoe_username?.trim();
    if (!username) {
      this.fail(
        `ONT ${serial} has operator firmware and only works over PPPoE. Enter the PPPoE username and password.`,
      );
    }
    if (!password && !known) {
      this.fail(`Enter the PPPoE password for ${username}.`);
    }
    return { username, password };
  }

  private async ensurePppoe(nodeId: string, plan: PppoePlan) {
    if (plan.password) {
      await this.inca.setPppoe(nodeId, {
        username: plan.username,
        password: plan.password,
      });
      await this.recorder.step(
        `PPPoE ${plan.username} set on Terminal Node ${nodeId}`,
      );
      return;
    }
    const live = await this.mustGetSubscriber(nodeId);
    if (live.pppoe_configured && live.pppoe_username === plan.username) {
      await this.recorder.step(
        `PPPoE ${plan.username} already set on Terminal Node ${nodeId}; skipped`,
      );
      return;
    }
    this.fail(
      `Enter the PPPoE password for ${plan.username} and retry: it is never stored.`,
    );
  }

  private assertPppoe(live: IncaSubscriber, plan: PppoePlan | null) {
    if (
      plan &&
      (!live.pppoe_configured || live.pppoe_username !== plan.username)
    ) {
      this.fail(
        `PPPoE ${plan.username} is not set on Terminal Node ${live.terminal_node_id} in INCA.`,
      );
    }
  }

  /** @param writes the ONT is about to be registered on / moved to the detected port. */
  private assertConfirmedLocation(
    detected: { olt_id: string; pon: string },
    input: RunInput,
    writes = false,
  ) {
    if (!input.confirmed_olt_id) {
      if (writes && this.config.requireOltConfirmation) {
        this.fail(
          'Detect the ONT and confirm its OLT / PON before it is registered there.',
        );
      }
      return;
    }
    if (
      detected.olt_id !== input.confirmed_olt_id ||
      (input.confirmed_pon && detected.pon !== input.confirmed_pon)
    ) {
      this.fail(
        `ONT is now detected on ${detected.olt_id} PON ${detected.pon}, not the confirmed ${input.confirmed_olt_id} PON ${input.confirmed_pon ?? '-'}. Detect again, confirm, and start a new run.`,
      );
    }
  }

  private async waitForTodo(terminalNodeId: string) {
    await this.enter('WAITING_TODO');
    await this.pollTodos(terminalNodeId);
  }

  /** Polls the node's INCA Todo until every task is done; fails on a failed task. */
  private async pollTodos(terminalNodeId: string) {
    const deadline = Date.now() + this.config.todoTimeoutMs;
    for (;;) {
      const todos = await this.inca.listTodo(terminalNodeId);
      const failed = todos.find((todo) => todo.status === 'FAILED');
      if (failed)
        this.fail(
          `INCA Todo ${failed.type} failed${failed.message ? `: ${failed.message}` : ''}.${todoHint(failed.message)}`,
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

  /**
   * The OLT reports optical levels only once the ONT has been configured and is online,
   * so poll until a reading arrives; that reading is the end of registration.
   */
  private async waitForOptical(serial: string): Promise<OpticalReading> {
    const deadline = Date.now() + this.config.todoTimeoutMs;
    let announced = false;
    for (;;) {
      let reading: OpticalReading | null = null;
      try {
        reading = await this.readSignal(serial);
      } catch (error) {
        if (
          !(error instanceof IncaUnavailableError) ||
          error instanceof IncaNotIntegratedError
        ) {
          throw error;
        }
      }
      if (reading?.online && reading.rx_dbm !== null) return reading;
      if (Date.now() >= deadline) {
        this.fail(
          `No optical info from the OLT for ONT ${serial}${reading?.alarms.length ? ` (${reading.alarms.join(', ')})` : ''}. Check the fibre and power, then retry.`,
        );
      }
      if (!announced) {
        announced = true;
        await this.recorder.step('Waiting for optical info from the OLT');
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.todoPollMs),
      );
    }
  }

  /**
   * PPPoE is only compared when the node had it (INCA nodes without Radius have none) and
   * this run did not set it on purpose.
   */
  private assertRetained(
    live: IncaSubscriber,
    base: ServiceBaseline,
    pppoeSet = false,
  ) {
    if (
      !pppoeSet &&
      base.pppoe_username &&
      (live.pppoe_username !== base.pppoe_username || !live.pppoe_enabled)
    ) {
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

/** What the technician can do about INCA's OLT-side Todo errors. */
function todoHint(message: string | undefined): string {
  if (!message || !/autofind/i.test(message)) return '';
  return ' The OLT does not see the ONT as new: check it is powered and connected, and that it is not still configured on the OLT from an earlier registration (Active Devices > Registered). INCA keeps retrying the Todo; press Retry once fixed.';
}

function required(value: string | null | undefined, label: string): string {
  if (!value?.trim()) {
    throw new IncaRejectedError(`${label} is required`);
  }
  return value.trim();
}
