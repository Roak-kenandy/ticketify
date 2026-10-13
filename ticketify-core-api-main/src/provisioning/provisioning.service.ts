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
  IncaOption,
  IncaRejectedError,
  IncaSubscriber,
  IncaUnavailableError,
} from 'src/infrastructure/inca/inca.types';
import {
  TicketSnapshot,
  TicketSnapshotService,
} from 'src/inventory/ticket-snapshot.service';
import { normalizeSerial } from 'src/inventory/ticket-inventory.service';
import {
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

type Actor = { id: string; crm_user_id?: string; role?: unknown };

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
  APPLYING_CONFIG: 'Applying subscriber configuration',
  WAITING_TODO: 'Waiting for INCA Todo',
  VERIFYING: 'Verifying service',
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
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    @Inject(INCA_CLIENT) private readonly inca: IncaClient,
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
      max_dbm: Number(this.config.get('INCA_RX_MAX_DBM') ?? -8),
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
    } = {
      service_areas: [],
      device_types: [],
      packages: [],
    };
    try {
      const [areas, devices, packages, found] = await Promise.all([
        this.inca.serviceAreas(),
        this.inca.deviceTypes(),
        this.inca.packages(),
        this.inca.findSubscriber(this.clientIdentifier(snapshot), purpose),
      ]);
      options = { service_areas: areas, device_types: devices, packages };
      subscriber = found;
    } catch (error) {
      available = false;
      incaError =
        error instanceof Error ? error.message : 'INCA is unavailable';
    }
    const transactions = await this.listForTicket(crmTicketId);
    const digits = (snapshot.sr_number ?? '').replace(/\D/g, '');
    return {
      crm_ticket_id: crmTicketId,
      sr_number: snapshot.sr_number,
      customer_name: snapshot.customer_name,
      client_identifier: this.clientIdentifier(snapshot),
      service_type: snapshot.service_type,
      category: snapshot.category,
      area: snapshot.area,
      address: snapshot.address,
      inca: { mode: this.inca.mode, available, error: incaError },
      policy: {
        ...policy,
        actions: policy.actions.map((action) => ({
          action,
          label: ACTION_LABELS[action],
        })),
      },
      subscriber: subscriber
        ? {
            terminal_node_id: subscriber.terminal_node_id,
            client_identifier: subscriber.client_identifier,
            service_area: subscriber.service_area,
            address: subscriber.address,
            package: subscriber.package,
            pppoe_username: subscriber.pppoe_username,
            pppoe_password_masked: '••••••••',
            pppoe_enabled: subscriber.pppoe_enabled,
            connected: subscriber.connected,
            onu_serials: subscriber.onu_serials,
            olt_id: subscriber.olt_id,
            pon: subscriber.pon,
          }
        : null,
      options,
      suggested: {
        pppoe_username: digits ? `mn${digits}` : null,
        service_area: this.matchArea(options.service_areas, snapshot.area),
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
  async detect(rawSerial: string) {
    const serial = normalizeSerial(rawSerial);
    if (!serial || !SERIAL_PATTERN.test(serial)) {
      throw new BadRequestException(
        `"${rawSerial}" is not a valid ONT serial number.`,
      );
    }
    try {
      const device = await this.inca.findDevice(serial);
      if (device?.registered) {
        return {
          serial,
          status: 'REGISTERED' as const,
          olt_id: device.olt_id,
          pon: device.pon,
          device_type: device.device_type,
          terminal_node_id: device.terminal_node_id,
          message: device.terminal_node_id
            ? `Already registered on ${device.olt_id} PON ${device.pon} and bound to Terminal Node ${device.terminal_node_id}.`
            : `Already registered on ${device.olt_id} PON ${device.pon}; the registration will be reused.`,
        };
      }
      const detected = await this.inca.detectUnregistered(serial);
      if (!detected) {
        return {
          serial,
          status: 'NOT_DETECTED' as const,
          olt_id: null,
          pon: null,
          device_type: null,
          terminal_node_id: null,
          message:
            'Not detected on any OLT. Check ONT power and the fibre connection, then detect again.',
        };
      }
      return {
        serial,
        status: 'UNREGISTERED' as const,
        olt_id: detected.olt_id,
        pon: detected.pon,
        device_type: detected.device_type ?? null,
        terminal_node_id: null,
        message: `Detected as unregistered on ${detected.olt_id} PON ${detected.pon}.`,
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

  async start(crmTicketId: string, actor: Actor, dto: StartProvisioningDto) {
    const snapshot = await this.snapshots.get(crmTicketId);
    const policy = this.policy(snapshot);
    if (!policy.actions.includes(dto.action)) {
      throw new BadRequestException(
        `${ACTION_LABELS[dto.action]} is not available for this service request.`,
      );
    }
    const input = this.buildInput(snapshot, dto);
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
      new_state: { transaction_id: txn.id, action: dto.action, submitted },
    });
    this.launch(txn.id, input, null, dto.pppoe_password ?? null);
    return this.view(txn.id);
  }

  async retry(transactionId: string, actor: Actor, dto: RetryProvisioningDto) {
    const txn = await this.findAccessible(transactionId, actor);
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
    try {
      await this.prisma.provisioningTransaction.update({
        where: { id: txn.id },
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

  private buildInput(
    snapshot: TicketSnapshot,
    dto: StartProvisioningDto,
  ): RunInput {
    const serial = normalizeSerial(dto.ont_serial);
    if (serial && !SERIAL_PATTERN.test(serial)) {
      throw new BadRequestException(
        `"${serial}" is not a valid ONT serial number.`,
      );
    }
    const text = (value?: string) => value?.trim() || null;
    const input: RunInput = {
      action: dto.action,
      client_identifier: this.clientIdentifier(snapshot),
      customer_name: snapshot.customer_name ?? snapshot.sr_number ?? 'Customer',
      ont_serial: serial,
      service_area: text(dto.service_area),
      device_type: text(dto.device_type),
      package: text(dto.package),
      address: text(dto.address) ?? snapshot.address,
      pppoe_username: text(dto.pppoe_username),
      new_ont: Boolean(dto.new_ont),
      confirmed_olt_id: text(dto.confirmed_olt_id),
      confirmed_pon: text(dto.confirmed_pon),
    };
    const missing: string[] = [];
    const need = (value: unknown, label: string) =>
      !value && missing.push(label);
    switch (dto.action) {
      case 'NEW_CONNECTION':
        need(input.ont_serial, 'ONT serial');
        need(input.service_area, 'service area');
        need(input.device_type, 'device type');
        need(input.package, 'package');
        need(input.pppoe_username, 'PPPoE username');
        break;
      case 'ONT_REPLACEMENT':
        need(input.ont_serial, 'replacement ONT serial');
        need(input.device_type, 'device type');
        break;
      case 'RELOCATION':
        need(input.service_area, 'destination service area');
        if (input.new_ont) {
          need(input.ont_serial, 'new ONT serial');
          need(input.device_type, 'device type');
        }
        break;
      case 'SIGNAL_CHECK':
        break;
    }
    if (missing.length) {
      throw new BadRequestException(`Missing ${missing.join(', ')}.`);
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
        submitted: txn.submitted,
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

function parseDate(value?: string, endOfDay = false): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:00`)
    : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
