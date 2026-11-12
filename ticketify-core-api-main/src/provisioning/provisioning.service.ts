import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProvisioningAction,
  ProvisioningStatus,
  ProvisioningStep,
  ProvisioningTransaction,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { TicketAccessService } from 'src/infrastructure/security/ticket-access.service';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import {
  INCA_CLIENT,
  IncaClient,
  IncaLocationInput,
  IncaNotIntegratedError,
  IncaOption,
  IncaRejectedError,
  IncaSubscriber,
  IncaTerminalNodeInput,
  IncaUnavailableError,
} from 'src/infrastructure/inca/inca.types';
import {
  TicketSnapshot,
  TicketSnapshotService,
} from 'src/inventory/ticket-snapshot.service';
import { normalizeSerial } from 'src/inventory/ticket-inventory.service';
import { TechnicianStockService } from 'src/inventory/technician-stock.service';
import {
  LocationDto,
  RetryProvisioningDto,
  SignalAfterDto,
  StartProvisioningDto,
} from './dto/provisioning.dto';
import {
  ACTION_LABELS,
  OpticalRange,
  provisioningPolicy,
  ProvisioningPolicy,
} from './provisioning-policy';
import {
  ProvisioningRunner,
  RunBaseline,
  RunInput,
  StageFailure,
} from './provisioning-runner';
import { CrmContactSyncService } from './crm-contact-sync.service';
import { UserAccess } from 'src/auth/access/access';

type Actor = { id: string; crm_user_id?: string; access?: UserAccess };

const IN_FLIGHT: ProvisioningStatus[] = [
  'VALIDATING',
  'REGISTERING_ONT',
  'APPLYING_CONFIG',
  'WAITING_TODO',
  'VERIFYING',
];
const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9:._/-]{3,63}$/;

export const STATUS_LABELS: Record<ProvisioningStatus, string> = {
  VALIDATING: 'Validating',
  REGISTERING_ONT: 'Registering ONT',
  APPLYING_CONFIG: 'Terminal node, ONU & package',
  WAITING_TODO: 'Waiting for INCA Todo',
  VERIFYING: 'Optical info',
  SUCCEEDED: 'Successful',
  FAILED: 'Failed',
};

type TxnWithSteps = ProvisioningTransaction & { steps?: ProvisioningStep[] };

export type ProvisioningClosureState = {
  policy: ProvisioningPolicy;
  required: {
    action: ProvisioningAction;
    status: ProvisioningStatus | null;
    error: string | null;
  } | null;
  signal: { required: boolean; captured: boolean; result: string | null };
  /** Newest Rx reading from any successful run on the ticket, checked against today's range. */
  last_reading: {
    action: ProvisioningAction;
    rx_dbm: number;
    within_range: boolean;
    range: OpticalRange;
  } | null;
  in_flight: ProvisioningAction[];
  failed_optional: ProvisioningAction[];
  installed_serials: string[];
};

@Injectable()
export class ProvisioningService implements OnModuleInit {
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IntegrationAuditService,
    private readonly access: TicketAccessService,
    private readonly snapshots: TicketSnapshotService,
    private readonly stock: TechnicianStockService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    @Inject(INCA_CLIENT) private readonly inca: IncaClient,
    private readonly contactSync: CrmContactSyncService,
  ) {}

  /** Runs interrupted by a restart can never finish; release them so Retry works. */
  async onModuleInit() {
    const result = await this.prisma.provisioningTransaction
      .updateMany({
        where: { status: { in: IN_FLIGHT } },
        data: {
          status: 'FAILED',
          error_message:
            'Interrupted by a server restart. Retry to continue from the current INCA state.',
          finished_at: new Date(),
        },
      })
      .catch(() => ({ count: 0 }));
    if (result.count) {
      this.logger.log(
        'Provisioning',
        `Released ${result.count} interrupted provisioning run(s)`,
      );
    }
  }

  range(): OpticalRange {
    return {
      min_dbm: Number(this.config.get('INCA_RX_MIN_DBM') ?? -27),
      max_dbm: Number(this.config.get('INCA_RX_MAX_DBM') ?? -17),
    };
  }

  policy(snapshot: Pick<TicketSnapshot, 'category'>): ProvisioningPolicy {
    return provisioningPolicy(
      snapshot.category,
      String(this.config.get('PROVISIONING_SIGNAL_REQUIRED_FOR') ?? ''),
    );
  }

  async context(crmTicketId: string) {
    const snapshot = await this.snapshots.get(crmTicketId);
    const policy = this.policy(snapshot);
    const purpose =
      snapshot.category === 'new_connections'
        ? 'new_connection'
        : 'existing_service';
    let available = true;
    let incaError: string | null = null;
    let subscriber: IncaSubscriber | null = null;
    let options: {
      service_areas: IncaOption[];
      device_types: IncaOption[];
      packages: IncaOption[];
      cities: IncaOption[];
    } = {
      service_areas: [],
      device_types: [],
      packages: [],
      cities: [],
    };
    const needsCities =
      policy.actions.includes('NEW_CONNECTION') ||
      policy.actions.includes('RELOCATION');
    try {
      const [areas, devices, packages, cities, found] = await Promise.all([
        this.inca.serviceAreas(),
        this.inca.deviceTypes(),
        this.inca.packages(),
        needsCities ? this.inca.cities() : [],
        // A lookup INCA is not integrated for yet must not take the whole screen offline.
        this.inca
          .findSubscriber(this.clientIdentifier(snapshot), purpose)
          .catch((error: unknown) => {
            if (error instanceof IncaNotIntegratedError) return null;
            throw error;
          }),
      ]);
      options = {
        service_areas: areas,
        device_types: devices,
        packages,
        cities,
      };
      subscriber = found;
    } catch (error) {
      available = false;
      incaError =
        error instanceof Error ? error.message : 'INCA is unavailable';
    }
    const [transactions, crmIdentity] = await Promise.all([
      this.listForTicket(crmTicketId),
      policy.actions.includes('NEW_CONNECTION')
        ? this.contactSync.identity(snapshot.contact_id ?? null)
        : null,
    ]);
    const digits = (snapshot.sr_number ?? '').replace(/\D/g, '');
    return {
      crm_ticket_id: crmTicketId,
      sr_number: snapshot.sr_number,
      customer_name: snapshot.customer_name,
      client_identifier: this.clientIdentifier(snapshot),
      crm_identity: crmIdentity,
      service_type: snapshot.service_type,
      category: snapshot.category,
      area: snapshot.area,
      address: snapshot.address,
      inca: {
        mode: this.inca.mode,
        available,
        error: incaError,
        pppoe_required: this.pppoeRequired,
        current_ont_required: this.currentOntRequired,
      },
      policy: {
        ...policy,
        actions: policy.actions.map((action) => ({
          action,
          label: ACTION_LABELS[action],
        })),
      },
      subscriber: subscriber ? subscriberView(subscriber) : null,
      options,
      suggested: {
        pppoe_username: digits ? `mn${digits}` : null,
        service_area: this.matchArea(options.service_areas, snapshot.area),
        terminal_node: {
          name: snapshot.customer_name ?? '',
          number: this.terminalNumber(snapshot.customer_phone),
          phone: snapshot.customer_phone?.trim() || null,
          city_id:
            options.cities.find(
              (city) =>
                city.label === this.matchArea(options.cities, snapshot.area),
            )?.code ?? null,
        },
      },
      range: this.range(),
      status: this.ticketStatus(policy, transactions, available),
      transactions,
    };
  }

  /**
   * Read-only Active Device lookup so the technician can confirm the detected
   * OLT / PON and device type before provisioning.
   */
  async detect(crmTicketId: string, actor: Actor, rawSerial: string) {
    const serial = normalizeSerial(rawSerial);
    if (!serial || !SERIAL_PATTERN.test(serial)) {
      throw new BadRequestException(
        `"${rawSerial}" is not a valid ONT serial number.`,
      );
    }
    await this.assertCanAct(crmTicketId, actor);
    try {
      const [record, active] = await Promise.allSettled([
        this.inca.findDevice(serial),
        this.inca.detectOnOlt(serial),
      ]);
      if (record.status === 'rejected') throw record.reason;
      const device = record.value;
      const onOlt = active.status === 'fulfilled' ? active.value : null;
      const runState = describeRunState(onOlt);
      const operator = {
        operator: onOlt?.operator ?? null,
        pppoe_required: onOlt?.pppoe_required === true,
      };
      const pppoeNote = operator.pppoe_required
        ? ` ${onOlt?.operator ?? 'Operator'} firmware: this ONT only gets service over PPPoE.`
        : '';

      if (device?.registered) {
        const pon =
          device.pon ?? (onOlt?.olt_id === device.olt_id ? onOlt.pon : null);
        const where = describeLocation(device.olt_name ?? device.olt_id, pon);
        const elsewhere =
          onOlt && device.olt_id && onOlt.olt_id !== device.olt_id
            ? ` The OLT currently sees it${describeLocation(onOlt.olt_name ?? onOlt.olt_id, onOlt.pon)}.`
            : '';
        const waiting =
          onOlt?.olt_state === 'UNREGISTERED'
            ? ' The OLT lists it as unregistered: it will be configured when it is added to the Terminal Node.'
            : '';
        return {
          serial,
          status: 'REGISTERED' as const,
          olt_id: device.olt_id,
          olt_name: device.olt_name ?? null,
          pon,
          device_type: device.device_type,
          terminal_node_id: device.terminal_node_id,
          olt_state: onOlt?.olt_state ?? null,
          online: onOlt?.online ?? null,
          ...operator,
          message:
            (device.terminal_node_id
              ? `In INCA${where} and bound to Terminal Node ${device.terminal_node_id}.`
              : `In INCA${where}, not on any Terminal Node; the INCA record will be reused.`) +
            runState +
            waiting +
            elsewhere +
            pppoeNote,
        };
      }
      if (active.status === 'rejected') throw active.reason;
      if (!onOlt) {
        return {
          serial,
          status: 'NOT_DETECTED' as const,
          olt_id: null,
          olt_name: null,
          pon: null,
          device_type: null,
          terminal_node_id: null,
          olt_state: null,
          online: null,
          ...operator,
          message:
            'Not detected on any OLT (registered or unregistered). Check ONT power and the fibre connection, then detect again.',
        };
      }
      const where = describeLocation(onOlt.olt_name ?? onOlt.olt_id, onOlt.pon);
      return {
        serial,
        status:
          onOlt.olt_state === 'REGISTERED'
            ? ('OLT_REGISTERED' as const)
            : ('UNREGISTERED' as const),
        olt_id: onOlt.olt_id,
        olt_name: onOlt.olt_name ?? null,
        pon: onOlt.pon,
        device_type: onOlt.device_type ?? null,
        terminal_node_id: null,
        olt_state: onOlt.olt_state ?? 'UNREGISTERED',
        online: onOlt.online ?? null,
        ...operator,
        message:
          onOlt.olt_state === 'REGISTERED'
            ? `Still configured${where} from an earlier registration, but has no INCA record.${runState} INCA can only add ONTs from the autofind list: have the NOC remove it from the OLT, then detect again.`
            : `Detected as unregistered${where}.${pppoeNote}`,
      };
    } catch (error) {
      if (error instanceof IncaUnavailableError) {
        throw new ServiceUnavailableException(
          `INCA unavailable: ${error.message}`,
        );
      }
      if (error instanceof IncaRejectedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * INCA changes and customer lookups belong to the technician working the job: the CRM
   * assignee, on a request in progress. Others with ticket access can still read runs.
   */
  async assertCanAct(crmTicketId: string, actor: Actor) {
    const snapshot = await this.snapshots.get(crmTicketId, true);
    if (
      !actor.crm_user_id ||
      snapshot.assigned_crm_user_id !== actor.crm_user_id
    ) {
      throw new ForbiddenException(
        'Only the technician assigned to this service request can use INCA provisioning.',
      );
    }
    if (snapshot.state !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'INCA provisioning is only available while the service request is in progress.',
      );
    }
    return snapshot;
  }

  async start(crmTicketId: string, actor: Actor, dto: StartProvisioningDto) {
    const snapshot = await this.assertCanAct(crmTicketId, actor);
    const policy = this.policy(snapshot);
    if (!policy.actions.includes(dto.action)) {
      throw new BadRequestException(
        `${ACTION_LABELS[dto.action]} is not available for this service request.`,
      );
    }
    const input = this.buildInput(snapshot, dto, await this.offeredChoices());
    if (input.terminal_node) {
      const crmIdentity = await this.contactSync.identity(
        snapshot.contact_id ?? null,
      );
      if (
        crmIdentity &&
        /^[A-Za-z0-9-]{3,30}$/.test(crmIdentity) &&
        crmIdentity.toUpperCase() !== input.terminal_node.client_identity
      ) {
        throw new BadRequestException(
          `The ID card / passport number must match the CRM contact (${crmIdentity}).`,
        );
      }
    }
    const installsOnt =
      dto.action === 'NEW_CONNECTION' ||
      dto.action === 'ONT_REPLACEMENT' ||
      (dto.action === 'RELOCATION' && input.new_ont);
    if (
      installsOnt &&
      input.ont_serial &&
      !this.stock.isInventoryTeam(actor) &&
      !(await this.stock.holdsSerial(actor.id, input.ont_serial))
    ) {
      throw new BadRequestException(
        `ONT ${input.ont_serial} is not issued to you. Pick one of your issued ONTs, or ask your supervisor to hand it to you.`,
      );
    }
    if (installsOnt && input.ont_serial) {
      const elsewhere = await this.prisma.provisioningTransaction.findFirst({
        where: {
          ont_serial: input.ont_serial,
          status: { in: IN_FLIGHT },
          crm_ticket_id: { not: crmTicketId },
        },
        select: { sr_number: true },
      });
      if (elsewhere) {
        throw new ConflictException(
          `ONT ${input.ont_serial} is being provisioned on ${elsewhere.sr_number ?? 'another service request'}. Wait for that run to finish.`,
        );
      }
    }
    const deviceItemCode = input.device_type
      ? await this.inca
          .deviceTypes()
          .then(
            (types) =>
              types.find((type) => type.code === input.device_type)
                ?.item_code ?? null,
          )
          .catch(() => null)
      : null;
    const submitted = {
      ...input,
      device_item_code: deviceItemCode,
      pppoe_password_provided: Boolean(dto.pppoe_password),
    };

    let txn: ProvisioningTransaction;
    try {
      txn = await this.prisma.provisioningTransaction.create({
        data: {
          crm_ticket_id: crmTicketId,
          sr_number: snapshot.sr_number,
          action: dto.action,
          technician_user_id: actor.id,
          submitted,
          ont_serial: input.ont_serial,
        },
      });
    } catch (error) {
      throw this.inFlightConflict(error);
    }
    await this.audit.log({
      entity_type: 'provisioning',
      entity_id: crmTicketId,
      action: 'PROVISIONING_STARTED',
      actor_user_id: actor.id,
      new_state: {
        transaction_id: txn.id,
        action: dto.action,
        submitted: publicSubmitted(submitted),
      },
    });
    this.launch(txn.id, input, null, dto.pppoe_password ?? null);
    return this.view(txn.id);
  }

  async retry(transactionId: string, actor: Actor, dto: RetryProvisioningDto) {
    const txn = await this.findAccessible(transactionId, actor);
    await this.assertCanAct(txn.crm_ticket_id, actor);
    if (txn.status !== 'FAILED') {
      throw new BadRequestException(
        'Only a failed provisioning run can be retried.',
      );
    }
    const newer = await this.prisma.provisioningTransaction.findFirst({
      where: {
        crm_ticket_id: txn.crm_ticket_id,
        action: txn.action,
        started_at: { gt: txn.started_at },
      },
      select: { id: true },
    });
    if (newer) {
      throw new BadRequestException(
        'A newer run exists for this action. Retry that one instead.',
      );
    }
    // Claimed only while still FAILED, so two simultaneous retries cannot both run it.
    let claimed: { count: number };
    try {
      claimed = await this.prisma.provisioningTransaction.updateMany({
        where: { id: txn.id, status: 'FAILED' },
        data: {
          status: 'VALIDATING',
          attempts: { increment: 1 },
          failed_stage: null,
          error_message: null,
          finished_at: null,
        },
      });
    } catch (error) {
      throw this.inFlightConflict(error);
    }
    if (!claimed.count) {
      throw new ConflictException('This run is already being retried.');
    }
    await this.audit.log({
      entity_type: 'provisioning',
      entity_id: txn.crm_ticket_id,
      action: 'PROVISIONING_RETRIED',
      actor_user_id: actor.id,
      old_state: {
        transaction_id: txn.id,
        failed_stage: txn.failed_stage,
        error: txn.error_message,
      },
      new_state: { attempt: txn.attempts + 1 },
    });
    const baseline = ((txn.result as { baseline?: RunBaseline } | null)
      ?.baseline ?? null) as RunBaseline | null;
    this.launch(
      txn.id,
      txn.submitted as unknown as RunInput,
      baseline,
      dto.pppoe_password ?? null,
    );
    return this.view(txn.id);
  }

  async signalAfter(transactionId: string, actor: Actor, dto: SignalAfterDto) {
    const txn = await this.findAccessible(transactionId, actor);
    await this.assertCanAct(txn.crm_ticket_id, actor);
    if (txn.action !== 'SIGNAL_CHECK' || txn.status !== 'SUCCEEDED') {
      throw new BadRequestException(
        'After readings are taken on a completed signal check.',
      );
    }
    const result = (txn.result ?? {}) as Record<string, unknown>;
    const serial = String(result.ont_serial ?? txn.ont_serial ?? '');
    const runner = new ProvisioningRunner(
      this.inca,
      this.noopRecorder(),
      this.runnerConfig(),
    );
    let after;
    try {
      after = await runner.readSignal(serial);
    } catch (error) {
      throw new BadRequestException(
        `Could not read the signal from INCA: ${error instanceof Error ? error.message : error}`,
      );
    }
    const next = {
      ...result,
      after,
      action_taken: dto.action_taken.trim(),
      service_confirmed: Boolean(dto.service_confirmed),
      signal_result: after?.result ?? 'NO_READING',
    };
    await this.prisma.$transaction([
      this.prisma.provisioningTransaction.update({
        where: { id: txn.id },
        data: { result: next as Prisma.InputJsonValue },
      }),
      this.prisma.provisioningStep.create({
        data: {
          transaction_id: txn.id,
          attempt: txn.attempts,
          stage: 'VERIFYING',
          ok: true,
          message: `${
            after
              ? `After reading: ${after.rx_dbm ?? 'n/a'} dBm`
              : 'After reading: no optical reading'
          }${dto.service_confirmed ? '; customer service confirmed working' : ''}`,
          detail: {
            action_taken: dto.action_taken.trim(),
            rx_dbm: after?.rx_dbm ?? null,
            service_confirmed: Boolean(dto.service_confirmed),
          },
        },
      }),
    ]);
    await this.audit.log({
      entity_type: 'provisioning',
      entity_id: txn.crm_ticket_id,
      action: 'PROVISIONING_SIGNAL_AFTER',
      actor_user_id: actor.id,
      old_state: { before: result.before ?? null },
      new_state: {
        after,
        action_taken: dto.action_taken.trim(),
        service_confirmed: Boolean(dto.service_confirmed),
      },
    });
    return this.view(txn.id);
  }

  async view(transactionId: string) {
    const txn = await this.prisma.provisioningTransaction.findUnique({
      where: { id: transactionId },
      include: { steps: { orderBy: { created_at: 'asc' } } },
    });
    if (!txn) throw new NotFoundException('Provisioning run not found');
    const [view] = await this.toViews([txn]);
    return view;
  }

  async viewForActor(transactionId: string, actor: Actor) {
    await this.findAccessible(transactionId, actor);
    return this.view(transactionId);
  }

  async listForTicket(crmTicketId: string) {
    const txns = await this.prisma.provisioningTransaction.findMany({
      where: { crm_ticket_id: crmTicketId },
      orderBy: { started_at: 'desc' },
      take: 20,
      include: { steps: { orderBy: { created_at: 'asc' } } },
    });
    return this.toViews(txns);
  }

  async log(query: {
    from?: string;
    to?: string;
    status?: string;
    action?: string;
    sr?: string;
  }) {
    const where: Prisma.ProvisioningTransactionWhereInput[] = [];
    const from = parseDate(query.from);
    const to = parseDate(query.to, true);
    if (from || to)
      where.push({
        started_at: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    const status = query.status?.trim().toUpperCase();
    if (status === 'IN_PROGRESS') where.push({ status: { in: IN_FLIGHT } });
    else if (status && status in STATUS_LABELS)
      where.push({ status: status as ProvisioningStatus });
    const action = query.action?.trim().toUpperCase();
    if (action && action in ACTION_LABELS)
      where.push({ action: action as ProvisioningAction });
    const sr = query.sr?.trim();
    if (sr) {
      where.push({
        OR: [
          { sr_number: { contains: sr, mode: 'insensitive' } },
          { crm_ticket_id: sr },
          { ont_serial: { contains: sr, mode: 'insensitive' } },
        ],
      });
    }
    const txns = await this.prisma.provisioningTransaction.findMany({
      where: { AND: where },
      orderBy: { started_at: 'desc' },
      take: 1000,
    });
    return this.toViews(txns);
  }

  async closureState(
    crmTicketId: string,
    snapshot: Pick<TicketSnapshot, 'category'>,
  ): Promise<ProvisioningClosureState> {
    const policy = this.policy(snapshot);
    const txns = await this.prisma.provisioningTransaction.findMany({
      where: { crm_ticket_id: crmTicketId },
      orderBy: { started_at: 'desc' },
    });
    const latest = new Map<ProvisioningAction, ProvisioningTransaction>();
    for (const txn of txns)
      if (!latest.has(txn.action)) latest.set(txn.action, txn);

    const required = policy.required_action
      ? latest.get(policy.required_action) ?? null
      : null;
    const signal = latest.get('SIGNAL_CHECK');
    const signalResult =
      signal?.status === 'SUCCEEDED'
        ? String(
            (signal.result as { signal_result?: string } | null)
              ?.signal_result ?? '',
          )
        : null;
    const range = this.range();
    let lastReading: ProvisioningClosureState['last_reading'] = null;
    for (const txn of txns) {
      if (txn.status !== 'SUCCEEDED') continue;
      const rx = readingOf(txn);
      if (rx === null) continue;
      lastReading = {
        action: txn.action,
        rx_dbm: rx,
        within_range: rx >= range.min_dbm && rx <= range.max_dbm,
        range,
      };
      break;
    }
    const installed = new Set<string>();
    for (const txn of latest.values()) {
      const serial = normalizeSerial(txn.ont_serial);
      if (txn.status === 'SUCCEEDED' && txn.installs_ont && serial)
        installed.add(serial);
    }
    return {
      policy,
      required: policy.required_action
        ? {
            action: policy.required_action,
            status: required?.status ?? null,
            error: required?.error_message ?? null,
          }
        : null,
      signal: {
        required: policy.signal_required,
        captured: Boolean(signalResult),
        result: signalResult || null,
      },
      last_reading: lastReading,
      in_flight: [...latest.values()]
        .filter((txn) => IN_FLIGHT.includes(txn.status))
        .map((txn) => txn.action),
      failed_optional: [...latest.values()]
        .filter(
          (txn) =>
            txn.status === 'FAILED' &&
            txn.action !== policy.required_action &&
            txn.action !== 'SIGNAL_CHECK',
        )
        .map((txn) => txn.action),
      installed_serials: [...installed],
    };
  }

  private launch(
    transactionId: string,
    input: RunInput,
    baseline: RunBaseline | null,
    password: string | null,
  ) {
    if (this.running.has(transactionId)) return;
    this.running.add(transactionId);
    void this.execute(transactionId, input, baseline, password).finally(() =>
      this.running.delete(transactionId),
    );
  }

  private async execute(
    transactionId: string,
    input: RunInput,
    baseline: RunBaseline | null,
    password: string | null,
  ) {
    const txn = await this.prisma.provisioningTransaction.findUniqueOrThrow({
      where: { id: transactionId },
    });
    const attempt = txn.attempts;
    let stage: ProvisioningStatus = 'VALIDATING';
    let savedBaseline = baseline;
    const recorder = {
      enter: async (status: ProvisioningStatus) => {
        stage = status;
        await this.prisma.provisioningTransaction.update({
          where: { id: transactionId },
          data: { status },
        });
      },
      step: async (message: string, detail?: Record<string, unknown>) => {
        await this.prisma.provisioningStep.create({
          data: {
            transaction_id: transactionId,
            attempt,
            stage,
            ok: true,
            message,
            detail: detail as Prisma.InputJsonValue,
          },
        });
      },
      saveBaseline: async (next: RunBaseline) => {
        savedBaseline = next;
        await this.prisma.provisioningTransaction.update({
          where: { id: transactionId },
          data: { result: { baseline: next } as Prisma.InputJsonValue },
        });
      },
    };
    const runner = new ProvisioningRunner(
      this.inca,
      recorder,
      this.runnerConfig(),
    );
    try {
      const outcome = await runner.run(input, baseline, password);
      await this.prisma.provisioningTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'SUCCEEDED',
          result: {
            ...outcome.result,
            baseline: savedBaseline,
          } as Prisma.InputJsonValue,
          ont_serial: outcome.ont_serial,
          old_ont_serial: outcome.old_ont_serial,
          installs_ont: outcome.installs_ont,
          finished_at: new Date(),
        },
      });
      await this.audit.log({
        entity_type: 'provisioning',
        entity_id: txn.crm_ticket_id,
        action: 'PROVISIONING_SUCCEEDED',
        actor_user_id: txn.technician_user_id,
        new_state: {
          transaction_id: transactionId,
          attempt,
          action: txn.action,
          result: outcome.result,
        },
      });
      await this.syncContact(txn, input, outcome.result, recorder.step);
    } catch (error) {
      const failure =
        error instanceof StageFailure
          ? error
          : new StageFailure(stage, 'Unexpected error while provisioning');
      if (!(error instanceof StageFailure)) {
        this.logger.error(
          'Provisioning',
          `Run ${transactionId} crashed: ${error instanceof Error ? error.message : error}`,
        );
      }
      await this.prisma.$transaction([
        this.prisma.provisioningStep.create({
          data: {
            transaction_id: transactionId,
            attempt,
            stage: failure.stage,
            ok: false,
            message: failure.message,
          },
        }),
        this.prisma.provisioningTransaction.update({
          where: { id: transactionId },
          data: {
            status: 'FAILED',
            failed_stage: failure.stage,
            error_message: failure.message,
            finished_at: new Date(),
          },
        }),
      ]);
      await this.audit.log({
        entity_type: 'provisioning',
        entity_id: txn.crm_ticket_id,
        action: 'PROVISIONING_FAILED',
        actor_user_id: txn.technician_user_id,
        new_state: {
          transaction_id: transactionId,
          attempt,
          action: txn.action,
          stage: failure.stage,
        },
        crm_sync_ok: false,
        error_message: failure.message,
      });
    }
  }

  /** After a successful run: ID card (Medianet ONT) or PPPoE id (Ooredoo ONT) to the CRM. */
  private async syncContact(
    txn: ProvisioningTransaction,
    input: RunInput,
    result: Record<string, unknown>,
    step: (message: string) => Promise<void>,
  ) {
    if (input.action === 'SIGNAL_CHECK') return;
    try {
      const snapshot = await this.snapshots.get(txn.crm_ticket_id);
      const ooredoo = result.pppoe_required === true;
      const message = await this.contactSync.afterProvisioning({
        crm_ticket_id: txn.crm_ticket_id,
        contact_id: snapshot.contact_id ?? null,
        actor_user_id: txn.technician_user_id,
        ooredoo,
        pppoe_username:
          typeof result.pppoe_username === 'string'
            ? result.pppoe_username
            : input.pppoe_username,
        client_identity:
          !ooredoo && input.action === 'NEW_CONNECTION'
            ? input.terminal_node?.client_identity ?? null
            : null,
      });
      if (message) await step(`CRM: ${message}`);
    } catch (error) {
      this.logger.warn(
        'Provisioning',
        `CRM contact sync for ${txn.crm_ticket_id} failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private terminalNodeInput(dto: StartProvisioningDto): IncaTerminalNodeInput {
    const node = dto.terminal_node;
    if (!node) {
      throw new BadRequestException('Enter the terminal node details.');
    }
    const text = (value?: string) => value?.trim() || null;
    return {
      ...this.locationInput(node),
      name: node.name.trim(),
      client_identity: node.client_identity.trim().toUpperCase(),
      client_name: node.client_name.trim(),
      phone: text(node.phone),
      email: text(node.email),
    };
  }

  /** City and street are each either picked from INCA or added by name, never both. */
  private locationInput(node?: LocationDto): IncaLocationInput {
    if (!node) {
      throw new BadRequestException('Enter the city, street and number.');
    }
    const text = (value?: string) => value?.trim() || null;
    const newCity = text(node.new_city_name);
    const newStreet = text(node.new_street_name);
    if (Boolean(node.city_id) === Boolean(newCity)) {
      throw new BadRequestException('Choose a city or add a new one.');
    }
    if (newCity && !node.new_city_area_code) {
      throw new BadRequestException('Enter the area code for the new city.');
    }
    if (Boolean(node.street_id) === Boolean(newStreet)) {
      throw new BadRequestException('Choose a street or add a new one.');
    }
    if (newCity && node.street_id) {
      throw new BadRequestException(
        'A new city has no streets yet; add the street too.',
      );
    }
    return {
      number: node.number,
      city_id: node.city_id ?? null,
      new_city: newCity
        ? { name: newCity, area_code: node.new_city_area_code as string }
        : null,
      street_id: node.street_id ?? null,
      new_street: newStreet,
    };
  }

  /** INCA streets of a city, for the terminal node form. */
  async streets(cityId: string) {
    if (!/^\d{1,10}$/.test(cityId)) {
      throw new BadRequestException('Choose a valid city.');
    }
    return this.incaRead(() => this.inca.streets(cityId));
  }

  /** Is the customer already an INCA client? Matched on ID card / passport number. */
  async findClient(crmTicketId: string, actor: Actor, identity: string) {
    const value = identity?.trim().toUpperCase() ?? '';
    if (!/^[A-Z0-9-]{3,30}$/.test(value)) {
      throw new BadRequestException(
        'Enter a valid ID card or passport number.',
      );
    }
    await this.assertCanAct(crmTicketId, actor);
    const client = await this.incaRead(() => this.inca.findClient(value));
    await this.audit.log({
      entity_type: 'provisioning',
      entity_id: crmTicketId,
      action: 'INCA_CLIENT_LOOKUP',
      actor_user_id: actor.id,
      new_state: { identity: maskIdentity(value), found: Boolean(client) },
    });
    return {
      identity: value,
      found: Boolean(client),
      name: client?.name ?? null,
    };
  }

  /** Replacement / relocation preview: the INCA Terminal Node the current ONT is attached to. */
  async subscriberBySerial(
    crmTicketId: string,
    actor: Actor,
    rawSerial: string,
  ) {
    const serial = normalizeSerial(rawSerial);
    if (!serial || !SERIAL_PATTERN.test(serial)) {
      throw new BadRequestException(
        `"${rawSerial}" is not a valid ONT serial number.`,
      );
    }
    await this.assertCanAct(crmTicketId, actor);
    const subscriber = await this.incaRead(() =>
      this.inca.findSubscriberBySerial(serial),
    );
    await this.audit.log({
      entity_type: 'provisioning',
      entity_id: crmTicketId,
      action: 'INCA_SUBSCRIBER_LOOKUP',
      actor_user_id: actor.id,
      new_state: {
        serial,
        terminal_node_id: subscriber?.terminal_node_id ?? null,
      },
    });
    return {
      serial,
      found: Boolean(subscriber),
      subscriber: subscriber ? subscriberView(subscriber) : null,
    };
  }

  /** Live optical reading for any ONT serial, outside a ticket; no customer details. */
  async signalStatus(actor: Actor, rawSerial: string) {
    const serial = normalizeSerial(rawSerial);
    if (!serial || !SERIAL_PATTERN.test(serial)) {
      throw new BadRequestException(
        `"${rawSerial}" is not a valid ONT serial number.`,
      );
    }
    const runner = new ProvisioningRunner(
      this.inca,
      this.noopRecorder(),
      this.runnerConfig(),
    );
    const [reading, device, types] = await Promise.all([
      this.incaRead(() => runner.readSignal(serial)),
      this.incaRead(() => this.inca.findDevice(serial)).catch(() => null),
      this.inca.deviceTypes().catch(() => [] as IncaOption[]),
    ]);
    const deviceType = device?.device_type
      ? types.find((type) => type.code === device.device_type)?.label ??
        device.device_type
      : null;
    await this.audit.log({
      entity_type: 'provisioning',
      entity_id: serial,
      action: 'INCA_SIGNAL_STATUS',
      actor_user_id: actor.id,
      new_state: {
        serial,
        rx_dbm: reading?.rx_dbm ?? null,
        result: reading?.result ?? 'NO_READING',
      },
    });
    return {
      serial,
      range: this.range(),
      found: Boolean(reading || device),
      device: device
        ? {
            registered: device.registered,
            device_type: deviceType,
            olt: device.olt_name ?? device.olt_id,
            pon: device.pon,
          }
        : null,
      reading,
    };
  }

  private async incaRead<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof IncaUnavailableError) {
        throw new ServiceUnavailableException(
          `INCA unavailable: ${error.message}`,
        );
      }
      if (error instanceof IncaRejectedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * A choice is only demanded when INCA offers options for it (the live adapter has no
   * package catalogue yet and the INCA account may have no service areas). If INCA cannot
   * be asked, both stay required.
   */
  private async offeredChoices() {
    const [areas, packages] = await Promise.all([
      this.inca.serviceAreas().catch(() => null),
      this.inca.packages().catch(() => null),
    ]);
    return {
      service_area: areas === null || areas.length > 0,
      package: packages === null || packages.length > 0,
    };
  }

  private buildInput(
    snapshot: TicketSnapshot,
    dto: StartProvisioningDto,
    offered: { service_area: boolean; package: boolean },
  ): RunInput {
    const serial = normalizeSerial(dto.ont_serial);
    if (serial && !SERIAL_PATTERN.test(serial)) {
      throw new BadRequestException(
        `"${serial}" is not a valid ONT serial number.`,
      );
    }
    const oldSerial =
      dto.action === 'ONT_REPLACEMENT' || dto.action === 'RELOCATION'
        ? normalizeSerial(dto.old_ont_serial)
        : null;
    if (oldSerial && !SERIAL_PATTERN.test(oldSerial)) {
      throw new BadRequestException(
        `"${oldSerial}" is not a valid ONT serial number.`,
      );
    }
    const text = (value?: string) => value?.trim() || null;
    const input: RunInput = {
      action: dto.action,
      client_identifier: this.clientIdentifier(snapshot),
      customer_name: snapshot.customer_name ?? snapshot.sr_number ?? 'Customer',
      ont_serial: serial,
      old_ont_serial: oldSerial,
      service_area: text(dto.service_area),
      device_type: text(dto.device_type),
      package: text(dto.package),
      address: text(dto.address) ?? snapshot.address,
      pppoe_username: text(dto.pppoe_username),
      new_ont: Boolean(dto.new_ont),
      confirmed_olt_id: text(dto.confirmed_olt_id),
      confirmed_pon: text(dto.confirmed_pon),
      terminal_node:
        dto.action === 'NEW_CONNECTION' ? this.terminalNodeInput(dto) : null,
      location:
        dto.action === 'RELOCATION' ? this.locationInput(dto.location) : null,
    };
    const missing: string[] = [];
    const need = (value: unknown, label: string) =>
      !value && missing.push(label);
    switch (dto.action) {
      case 'NEW_CONNECTION':
        need(input.ont_serial, 'ONT serial');
        if (offered.service_area) need(input.service_area, 'service area');
        need(input.device_type, 'device type');
        if (offered.package) need(input.package, 'package');
        if (this.pppoeRequired) need(input.pppoe_username, 'PPPoE username');
        break;
      case 'ONT_REPLACEMENT':
        if (this.currentOntRequired) need(oldSerial, 'current ONT serial');
        need(input.ont_serial, 'replacement ONT serial');
        need(input.device_type, 'device type');
        if (oldSerial && oldSerial === serial) {
          throw new BadRequestException(
            'The replacement ONT must be a different device from the current ONT.',
          );
        }
        break;
      case 'RELOCATION':
        if (this.currentOntRequired) need(oldSerial, 'current ONT serial');
        if (input.new_ont) {
          need(input.ont_serial, 'new ONT serial');
          need(input.device_type, 'device type');
          if (oldSerial && oldSerial === serial) {
            throw new BadRequestException(
              'The new ONT must be a different device from the current ONT.',
            );
          }
        }
        break;
      case 'SIGNAL_CHECK':
        break;
    }
    if (missing.length) {
      throw new BadRequestException(`Missing ${missing.join(', ')}.`);
    }
    if (dto.pppoe_password && !input.pppoe_username) {
      throw new BadRequestException(
        'Enter the PPPoE username for this password.',
      );
    }
    return input;
  }

  private ticketStatus(
    policy: ProvisioningPolicy,
    transactions: Awaited<ReturnType<ProvisioningService['toViews']>>,
    incaAvailable: boolean,
  ) {
    const latestRequired = policy.required_action
      ? transactions.find((txn) => txn.action === policy.required_action)
      : undefined;
    if (transactions.some((txn) => txn.in_progress)) {
      return { code: 'IN_PROGRESS', label: 'Provisioning in progress' };
    }
    if (!policy.required_action) {
      return { code: 'NOT_REQUIRED', label: 'Provisioning optional' };
    }
    if (latestRequired?.status === 'SUCCEEDED') {
      return { code: 'SUCCEEDED', label: 'Provisioning successful' };
    }
    if (
      !incaAvailable ||
      latestRequired?.error_message?.startsWith('INCA unavailable')
    ) {
      return {
        code: 'INTEGRATION_ERROR',
        label: 'Pending provisioning: INCA integration error',
      };
    }
    if (latestRequired?.status === 'FAILED') {
      return { code: 'FAILED', label: 'Provisioning failed' };
    }
    return { code: 'PENDING', label: 'Pending provisioning' };
  }

  private async toViews(txns: TxnWithSteps[]) {
    const ids = [...new Set(txns.map((txn) => txn.technician_user_id))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const names = new Map(
      users.map((user) => [user.id, user.name?.trim() || user.email]),
    );
    const latestByKey = new Set<string>();
    return txns.map((txn) => {
      const key = `${txn.crm_ticket_id}:${txn.action}`;
      const isLatest = !latestByKey.has(key);
      latestByKey.add(key);
      const result = (txn.result ?? null) as Record<string, unknown> | null;
      const publicResult = result
        ? Object.fromEntries(
            Object.entries(result).filter(([k]) => k !== 'baseline'),
          )
        : null;
      return {
        id: txn.id,
        crm_ticket_id: txn.crm_ticket_id,
        sr_number: txn.sr_number,
        action: txn.action,
        action_label: ACTION_LABELS[txn.action],
        status: txn.status,
        status_label: STATUS_LABELS[txn.status],
        in_progress: IN_FLIGHT.includes(txn.status),
        attempts: txn.attempts,
        failed_stage: txn.failed_stage,
        failed_stage_label: txn.failed_stage
          ? STATUS_LABELS[txn.failed_stage as ProvisioningStatus] ??
            txn.failed_stage
          : null,
        error_message: txn.error_message,
        can_retry: txn.status === 'FAILED' && isLatest,
        submitted: publicSubmitted(txn.submitted),
        result:
          publicResult && Object.keys(publicResult).length
            ? publicResult
            : null,
        ont_serial: txn.ont_serial,
        old_ont_serial: txn.old_ont_serial,
        installs_ont: txn.installs_ont,
        technician: {
          id: txn.technician_user_id,
          name: names.get(txn.technician_user_id) ?? 'Unknown user',
        },
        started_at: txn.started_at,
        finished_at: txn.finished_at,
        updated_at: txn.updated_at,
        steps: (txn.steps ?? []).map((step) => ({
          id: step.id,
          attempt: step.attempt,
          stage: step.stage,
          stage_label:
            STATUS_LABELS[step.stage as ProvisioningStatus] ?? step.stage,
          ok: step.ok,
          message: step.message,
          created_at: step.created_at,
        })),
      };
    });
  }

  private async findAccessible(transactionId: string, actor: Actor) {
    const txn = await this.prisma.provisioningTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!txn) throw new NotFoundException('Provisioning run not found');
    if (!(await this.access.canAccess(actor, 'ticket', txn.crm_ticket_id))) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    return txn;
  }

  private inFlightConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'A provisioning run is already in progress for this service request.',
      );
    }
    return error;
  }

  private runnerConfig() {
    return {
      range: this.range(),
      todoTimeoutMs: Number(this.config.get('INCA_TODO_TIMEOUT_MS') ?? 120_000),
      todoPollMs: Number(this.config.get('INCA_TODO_POLL_MS') ?? 2_000),
      requireOltConfirmation: true,
    };
  }

  private noopRecorder() {
    return {
      enter: async () => undefined,
      step: async () => undefined,
      saveBaseline: async () => undefined,
    };
  }

  private clientIdentifier(snapshot: TicketSnapshot) {
    return snapshot.contact_id ?? snapshot.sr_number ?? snapshot.crm_ticket_id;
  }

  /**
   * Live INCA asks for PPPoE only for operator-firmware ONTs, which Detect and the runner
   * flag per serial; the simulator always applies it.
   */
  private get pppoeRequired() {
    return this.inca.mode !== 'live';
  }

  /** Live INCA has no customer lookup, so replacement finds the node by the current ONT. */
  private get currentOntRequired() {
    return this.inca.mode === 'live';
  }

  /** INCA numbers terminal nodes by the customer's 7-digit local phone number. */
  private terminalNumber(phone: string | null) {
    const digits = (phone ?? '').replace(/\D/g, '');
    return digits.length > 7 ? digits.slice(-7) : digits;
  }

  private matchArea(areas: IncaOption[], area: string | null) {
    if (!area) return null;
    const needle = area.toLowerCase().replace(/[^a-z]/g, '');
    return (
      areas.find(
        (option) =>
          option.label.toLowerCase().replace(/[^a-z]/g, '') === needle,
      )?.label ?? null
    );
  }
}

function describeLocation(olt: string | null, pon: string | null): string {
  if (!olt) return '';
  return pon ? ` on ${olt} PON ${pon}` : ` on ${olt}`;
}

/**
 * What a run shows back: the provisioning choices only. The new-connection client details
 * (ID card, name, phone, e-mail) stay in the run record for retries and are not returned.
 */
function publicSubmitted(submitted: unknown) {
  const value = (submitted ?? {}) as Record<string, unknown>;
  const keys = [
    'action',
    'ont_serial',
    'old_ont_serial',
    'service_area',
    'device_type',
    'device_item_code',
    'package',
    'pppoe_username',
    'new_ont',
    'confirmed_olt_id',
    'confirmed_pon',
    'pppoe_password_provided',
  ];
  return Object.fromEntries(
    keys.filter((key) => key in value).map((key) => [key, value[key]]),
  );
}

/** Enough of an ID card number to recognise it in the audit log, not to reuse it. */
function maskIdentity(identity: string) {
  return identity.length <= 3
    ? '***'
    : `${'*'.repeat(identity.length - 3)}${identity.slice(-3)}`;
}

function subscriberView(subscriber: IncaSubscriber) {
  return {
    terminal_node_id: subscriber.terminal_node_id,
    client_identifier: subscriber.client_identifier,
    service_area: subscriber.service_area,
    address: subscriber.address,
    package: subscriber.package,
    pppoe_username: subscriber.pppoe_username,
    pppoe_password_masked: '••••••••',
    pppoe_enabled: subscriber.pppoe_enabled,
    pppoe_configured: subscriber.pppoe_configured ?? subscriber.pppoe_enabled,
    connected: subscriber.connected,
    onu_serials: subscriber.onu_serials,
    olt_id: subscriber.olt_id,
    pon: subscriber.pon,
    location: subscriber.location ?? null,
  };
}

function describeRunState(
  detection: { olt_state?: string; online?: boolean | null } | null,
): string {
  if (detection?.olt_state !== 'REGISTERED' || detection.online == null) {
    return '';
  }
  return detection.online
    ? ' The OLT reports it online.'
    : ' The OLT reports it offline.';
}

/** Rx dBm a run ended with: a signal check's after reading wins over its before reading. */
function readingOf(txn: ProvisioningTransaction): number | null {
  type Reading = { rx_dbm?: number | null } | null | undefined;
  const result = (txn.result ?? {}) as {
    optical?: Reading;
    before?: Reading;
    after?: Reading;
  };
  const reading =
    txn.action === 'SIGNAL_CHECK'
      ? result.after ?? result.before
      : result.optical;
  const rx = reading?.rx_dbm;
  return typeof rx === 'number' && Number.isFinite(rx) ? rx : null;
}

function parseDate(value?: string, endOfDay = false): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:00`)
    : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
