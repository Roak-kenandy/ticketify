"use client";

import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  Box,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Circle,
  CloudOff,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Navigation,
  PlusCircle,
  Radio,
  ScanLine,
  Search,
  Square,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import moment from "moment";
import React from "react";
import { PrimaryButton, SecondaryButton } from "@/components/field/ui/button";
import SerialScanner from "@/components/field/ui/serial-scanner";
import { ErrorState, InlineBanner } from "@/components/field/ui/state-views";
import { Switch } from "@/components/field/ui/switch";
import WorkflowSheet, {
  ChipSelect,
  Fact,
  SectionTitle,
  SheetBody,
  SheetCard,
  SheetCenter,
} from "@/components/field/ui/workflow-sheet";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { showError, showInfo, showSuccess } from "@/lib/field/notify";
import { isValidSerial, normalizeSerial } from "@/lib/field/serial";
import { useSession } from "@/lib/field/session";
import type {
  IncaOption,
  OntDetection,
  OpticalReading,
  ProvisioningAction,
  ProvisioningContext,
  ProvisioningStatus,
  ProvisioningTransaction,
} from "@/types/field-workflow";

type Screen = "home" | "form" | "run";

type Form = {
  serial: string;
  deviceType: string | null;
  serviceArea: string | null;
  package: string | null;
  pppoeUsername: string;
  pppoePassword: string;
  address: string;
  newOnt: boolean;
  /** Last Active Device lookup for the ONT being provisioned. */
  detection: OntDetection | null;
  oltConfirmed: boolean;
};

const POLL_MS = 2000;
const PIPELINE: ProvisioningStatus[] = ["VALIDATING", "REGISTERING_ONT", "APPLYING_CONFIG", "WAITING_TODO", "VERIFYING"];
const STAGE_LABELS: Record<string, string> = {
  VALIDATING: "Validating",
  REGISTERING_ONT: "Registering ONT",
  APPLYING_CONFIG: "Applying subscriber configuration",
  WAITING_TODO: "Waiting for INCA Todo",
  VERIFYING: "Verifying service",
};
const ACTION_META: Record<ProvisioningAction, { icon: LucideIcon; hint: string }> = {
  NEW_CONNECTION: {
    icon: PlusCircle,
    hint: "Register the ONT, create the subscriber and apply PPPoE and package.",
  },
  ONT_REPLACEMENT: {
    icon: ArrowLeftRight,
    hint: "Swap the faulty ONT and keep the customer's existing service.",
  },
  RELOCATION: {
    icon: Navigation,
    hint: "Move the service to the new address and service area.",
  },
  SIGNAL_CHECK: {
    icon: Activity,
    hint: "Read the ONT optical level before and after your fix.",
  },
};

export default function ProvisioningModal({
  visible,
  ticketId,
  srNumber,
  onClose,
  onChanged,
  onOpenInventory,
}: {
  visible: boolean;
  ticketId: string;
  srNumber?: string | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenInventory: () => void;
}) {
  const { token } = useSession();
  const [ctx, setCtx] = React.useState<ProvisioningContext | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [view, setView] = React.useState<Screen>("home");
  const [action, setAction] = React.useState<ProvisioningAction | null>(null);
  const [form, setForm] = React.useState<Form>(emptyForm());
  const [showErrors, setShowErrors] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [detecting, setDetecting] = React.useState(false);
  const [run, setRun] = React.useState<ProvisioningTransaction | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setCtx(await apiGet(`/provisioning/tickets/${ticketId}`, token));
    } catch (err: any) {
      setLoadError(err?.message || "Could not load provisioning");
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  React.useEffect(() => {
    if (visible) {
      setView("home");
      setRun(null);
      load();
    }
  }, [visible, load]);

  const runId = run?.id;
  const runActive = Boolean(run?.in_progress);
  React.useEffect(() => {
    if (!visible || !runId || !runActive) {
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const next: ProvisioningTransaction = await apiGet(`/provisioning/transactions/${runId}`, token, {
          silent: true,
        });
        setRun(next);
        if (!next.in_progress) {
          if (next.status === "SUCCEEDED") {
            showSuccess(`${next.action_label} completed`);
          }
          onChanged();
          load();
        }
      } catch {
        setRun((current) => (current ? { ...current } : current));
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [visible, runId, runActive, run, token, onChanged, load]);

  const openForm = (next: ProvisioningAction) => {
    if (!ctx) {
      return;
    }
    const sub = ctx.subscriber;
    setAction(next);
    setShowErrors(false);
    setForm({
      ...emptyForm(),
      serial: next === "SIGNAL_CHECK" ? (sub?.onu_serials[0] ?? "") : "",
      serviceArea: ctx.suggested.service_area,
      package: next === "NEW_CONNECTION" ? null : (sub?.package ?? null),
      pppoeUsername: ctx.suggested.pppoe_username ?? "",
      address: ctx.address ?? "",
      deviceType: ctx.options.device_types.length === 1 ? ctx.options.device_types[0].code : null,
    });
    setView("form");
  };

  const formErrors = action && ctx ? validate(action, form, ctx) : {};

  const updateForm = (patch: Partial<Form>) =>
    setForm((current) => {
      const next = { ...current, ...patch };
      return "serial" in patch || "newOnt" in patch ? { ...next, detection: null, oltConfirmed: false } : next;
    });

  const detect = async () => {
    if (!action || !ctx) {
      return;
    }
    const serial = normalizeSerial(detectionSerial(action, form, ctx));
    if (!isValidSerial(serial)) {
      showError("Scan or enter a valid ONT serial first");
      return;
    }
    setDetecting(true);
    try {
      const result: OntDetection = await apiPost(
        `/provisioning/tickets/${ticketId}/detect`,
        { ont_serial: serial },
        token,
      );
      const knownType = ctx.options.device_types.some((type) => type.code === result.device_type)
        ? result.device_type
        : null;
      setForm((current) => ({
        ...current,
        detection: result,
        oltConfirmed: false,
        deviceType: knownType ?? current.deviceType,
      }));
    } catch (err: any) {
      showError(err?.message || "Could not reach INCA to detect the ONT");
    } finally {
      setDetecting(false);
    }
  };

  const start = async () => {
    if (!action) {
      return;
    }
    if (Object.keys(formErrors).length) {
      setShowErrors(true);
      showError("Complete the highlighted fields");
      return;
    }
    setStarting(true);
    try {
      const needsOnt =
        action === "NEW_CONNECTION" ||
        action === "ONT_REPLACEMENT" ||
        (action === "RELOCATION" && form.newOnt) ||
        action === "SIGNAL_CHECK";
      const txn: ProvisioningTransaction = await apiPost(
        `/provisioning/tickets/${ticketId}/start`,
        {
          action,
          ont_serial: needsOnt ? normalizeSerial(form.serial) || undefined : undefined,
          device_type:
            action === "SIGNAL_CHECK" || (action === "RELOCATION" && !form.newOnt)
              ? undefined
              : (form.deviceType ?? undefined),
          service_area:
            action === "NEW_CONNECTION" || action === "RELOCATION" ? (form.serviceArea ?? undefined) : undefined,
          package: action === "NEW_CONNECTION" ? (form.package ?? undefined) : undefined,
          pppoe_username: action === "NEW_CONNECTION" ? form.pppoeUsername.trim() : undefined,
          pppoe_password: action === "NEW_CONNECTION" && form.pppoePassword ? form.pppoePassword : undefined,
          address: action === "RELOCATION" ? form.address.trim() || undefined : undefined,
          new_ont: action === "RELOCATION" ? form.newOnt : undefined,
          ...(form.detection?.status === "UNREGISTERED" && form.oltConfirmed
            ? {
                confirmed_olt_id: form.detection.olt_id ?? undefined,
                confirmed_pon: form.detection.pon ?? undefined,
              }
            : {}),
        },
        token,
      );
      setForm((current) => ({ ...current, pppoePassword: "" }));
      setRun(txn);
      setView("run");
    } catch (err: any) {
      showError(err?.message || "Could not start provisioning");
    } finally {
      setStarting(false);
    }
  };

  const close = () => {
    if (run?.in_progress) {
      showInfo("Provisioning continues in the background");
    }
    onClose();
  };

  const title =
    view === "home"
      ? "INCA provisioning"
      : view === "form"
        ? (ctx?.policy.actions.find((a) => a.action === action)?.label ?? "Provision")
        : (run?.action_label ?? "Provisioning");

  return (
    <WorkflowSheet
      visible={visible}
      title={title}
      subtitle={srNumber ? `Ticket #${srNumber}` : null}
      onClose={close}
      onBack={view === "home" ? undefined : () => setView("home")}
      footer={
        view === "form" ? (
          <>
            <SecondaryButton text="Back" onClick={() => setView("home")} className="flex-1" />
            <PrimaryButton
              text={action === "SIGNAL_CHECK" ? "Read signal" : "Start"}
              onClick={start}
              loading={starting}
              disabled={!ctx?.inca.available}
              className="flex-1"
            />
          </>
        ) : null
      }
    >
      {loading && !ctx ? (
        <SheetCenter>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-gray2">Connecting to INCA…</p>
        </SheetCenter>
      ) : loadError && !ctx ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : !ctx ? null : view === "home" ? (
        <HomeView
          ctx={ctx}
          refreshing={loading}
          onRefresh={load}
          onChoose={openForm}
          onOpenRun={(txn) => {
            setRun(txn);
            setView("run");
          }}
        />
      ) : view === "form" && action ? (
        <FormView
          ctx={ctx}
          action={action}
          form={form}
          errors={showErrors ? formErrors : {}}
          pendingCount={Object.keys(formErrors).length}
          detecting={detecting}
          onChange={updateForm}
          onScan={() => setScanning(true)}
          onDetect={detect}
        />
      ) : run ? (
        <RunView
          key={run.id}
          run={run}
          range={ctx.range}
          onUpdated={(next) => {
            setRun(next);
            if (!next.in_progress) {
              onChanged();
              load();
            }
          }}
          onOpenInventory={onOpenInventory}
        />
      ) : null}

      <SerialScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(serial) => {
          updateForm({ serial });
          setScanning(false);
        }}
      />
    </WorkflowSheet>
  );
}

function emptyForm(): Form {
  return {
    serial: "",
    deviceType: null,
    serviceArea: null,
    package: null,
    pppoeUsername: "",
    pppoePassword: "",
    address: "",
    newOnt: false,
    detection: null,
    oltConfirmed: false,
  };
}

type FormErrors = Partial<Record<keyof Form, string>>;

/** Actions that register or move an ONT need a confirmed OLT / PON first. */
function needsDetection(action: ProvisioningAction) {
  return action !== "SIGNAL_CHECK";
}

/** Relocation without a new ONT detects the customer's existing ONT at the destination. */
function detectionSerial(action: ProvisioningAction, form: Form, ctx: ProvisioningContext) {
  return action === "RELOCATION" && !form.newOnt ? (ctx.subscriber?.onu_serials[0] ?? "") : form.serial;
}

function validate(action: ProvisioningAction, form: Form, ctx: ProvisioningContext): FormErrors {
  const errors: FormErrors = {};
  const serialNeeded =
    action === "NEW_CONNECTION" || action === "ONT_REPLACEMENT" || (action === "RELOCATION" && form.newOnt);
  if (serialNeeded && !normalizeSerial(form.serial)) {
    errors.serial = "Scan or enter the ONT serial";
  } else if (form.serial && !isValidSerial(form.serial)) {
    errors.serial = "Not a valid serial number";
  }
  if (serialNeeded && !form.deviceType) {
    errors.deviceType = "Choose the device type";
  }
  if ((action === "NEW_CONNECTION" || action === "RELOCATION") && !form.serviceArea) {
    errors.serviceArea = "Choose the service area";
  }
  if (action === "NEW_CONNECTION") {
    if (!form.package) {
      errors.package = "Choose the package";
    }
    if (!/^[A-Za-z0-9._@-]{3,64}$/.test(form.pppoeUsername.trim())) {
      errors.pppoeUsername = "Use 3–64 letters, digits or . _ @ -";
    }
    if (form.pppoePassword && form.pppoePassword.length < 6) {
      errors.pppoePassword = "At least 6 characters";
    }
  }
  if (needsDetection(action) && !errors.serial) {
    const serial = normalizeSerial(detectionSerial(action, form, ctx));
    const detection = form.detection;
    if (!detection || detection.serial !== serial) {
      errors.detection = "Detect the ONT to confirm its OLT / PON";
    } else if (detection.status === "NOT_DETECTED") {
      errors.detection = "ONT is not detected on any OLT";
    } else if (detection.status === "UNREGISTERED" && !form.oltConfirmed) {
      errors.detection = "Confirm the detected OLT / PON";
    }
  }
  return errors;
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold", className)}>{children}</span>
  );
}

function StatusPill({ run }: { run: ProvisioningTransaction }) {
  const tone =
    run.status === "SUCCEEDED"
      ? "bg-success-bg text-success"
      : run.status === "FAILED"
        ? "bg-error-bg text-error"
        : "bg-info-bg text-info";
  return <Pill className={tone}>{run.in_progress ? "In progress" : run.status_label}</Pill>;
}

function HomeView({
  ctx,
  refreshing,
  onRefresh,
  onChoose,
  onOpenRun,
}: {
  ctx: ProvisioningContext;
  refreshing: boolean;
  onRefresh: () => void;
  onChoose: (action: ProvisioningAction) => void;
  onOpenRun: (run: ProvisioningTransaction) => void;
}) {
  const latest = (action: ProvisioningAction) => ctx.transactions.find((txn) => txn.action === action);
  const recommended = ctx.policy.actions.filter(({ action }) => ctx.policy.recommended.includes(action));
  const others = ctx.policy.actions.filter(({ action }) => !ctx.policy.recommended.includes(action));
  const renderAction = ({ action, label }: { action: ProvisioningAction; label: string }) => {
    const last = latest(action);
    const Icon = ACTION_META[action].icon;
    return (
      <button
        key={action}
        type="button"
        onClick={() => (last?.in_progress ? onOpenRun(last) : onChoose(action))}
        disabled={!ctx.inca.available && !last}
        className="flex items-center gap-3 rounded-lg border border-borderlight bg-white p-4 text-left active:bg-surface disabled:opacity-50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-tertiary">
          <Icon className="h-[22px] w-[22px] text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">{label}</span>
            {ctx.policy.required_action === action ? (
              <Pill className="bg-warning-bg text-warning">Required</Pill>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[13px] leading-[18px] text-gray2">{ACTION_META[action].hint}</span>
          {last ? (
            <span className="mt-2 block">
              <StatusPill run={last} />
            </span>
          ) : null}
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-gray3" />
      </button>
    );
  };
  const bannerTone =
    ctx.status.code === "SUCCEEDED" || ctx.status.code === "NOT_REQUIRED"
      ? "info"
      : ctx.status.code === "INTEGRATION_ERROR" || ctx.status.code === "FAILED"
        ? "error"
        : "warning";

  return (
    <SheetBody>
      {!ctx.inca.available ? (
        <InlineBanner
          tone="error"
          icon={CloudOff}
          message={`INCA is unreachable${
            ctx.inca.error ? ` (${ctx.inca.error})` : ""
          }. The ticket stays pending provisioning until INCA is back.`}
          actionLabel={refreshing ? undefined : "Retry"}
          onAction={onRefresh}
        />
      ) : null}
      <InlineBanner
        tone={bannerTone}
        icon={ctx.status.code === "SUCCEEDED" ? CheckCircle2 : Radio}
        message={ctx.status.label}
      />
      {ctx.inca.mode === "dummy" ? (
        <p className="text-xs text-gray2">Test mode: INCA is simulated, no real network changes are made.</p>
      ) : null}

      {ctx.subscriber ? (
        <>
          <SectionTitle>Current service</SectionTitle>
          <SheetCard>
            <Fact label="Terminal node" value={ctx.subscriber.terminal_node_id} />
            <Fact label="ONT" value={ctx.subscriber.onu_serials.join(", ") || "None"} />
            <Fact label="Service area" value={ctx.subscriber.service_area} />
            <Fact label="Package" value={ctx.subscriber.package} />
            <Fact label="PPPoE user" value={ctx.subscriber.pppoe_username} />
            <Fact label="PPPoE password" value={ctx.subscriber.pppoe_password_masked} />
            <Fact label="OLT / PON" value={[ctx.subscriber.olt_id, ctx.subscriber.pon].filter(Boolean).join(" · ")} />
            <Fact label="Connection" value={ctx.subscriber.connected ? "Online" : "Offline"} />
          </SheetCard>
        </>
      ) : null}

      <SectionTitle>
        Recommended for this ticket
        {ctx.service_type ? ` (${ctx.service_type})` : ""}
      </SectionTitle>
      {recommended.map(renderAction)}

      {others.length ? (
        <>
          <SectionTitle>Other INCA actions</SectionTitle>
          <p className="text-xs text-gray2">Use these when the work on site differs from the service request type.</p>
          {others.map(renderAction)}
        </>
      ) : null}

      {ctx.transactions.length ? (
        <>
          <SectionTitle>History</SectionTitle>
          <div className="rounded-lg border border-borderlight bg-white px-4">
            {ctx.transactions.slice(0, 8).map((txn, index) => (
              <button
                key={txn.id}
                type="button"
                onClick={() => onOpenRun(txn)}
                className={cn("flex w-full items-center gap-3 py-3 text-left", index > 0 && "border-t border-borderlight")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{txn.action_label}</span>
                  <span className="block text-xs text-gray2">
                    {moment(txn.started_at).format("D MMM, HH:mm")}
                    {txn.attempts > 1 ? ` · ${txn.attempts} attempts` : ""}
                    {txn.ont_serial ? ` · ${txn.ont_serial}` : ""}
                  </span>
                </span>
                <StatusPill run={txn} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </SheetBody>
  );
}

function SerialInput({
  value,
  error,
  onChange,
  onScan,
}: {
  value: string;
  error?: boolean;
  onChange: (value: string) => void;
  onScan: () => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        className={cn("input flex-1 font-mono uppercase", error && "border-error")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Scan or type serial"
      />
      <button
        type="button"
        onClick={onScan}
        aria-label="Scan serial"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary"
      >
        <ScanLine className="h-[22px] w-[22px] text-white" />
      </button>
    </div>
  );
}

function FormView({
  ctx,
  action,
  form,
  errors,
  pendingCount,
  detecting,
  onChange,
  onScan,
  onDetect,
}: {
  ctx: ProvisioningContext;
  action: ProvisioningAction;
  form: Form;
  errors: FormErrors;
  pendingCount: number;
  detecting: boolean;
  onChange: (patch: Partial<Form>) => void;
  onScan: () => void;
  onDetect: () => void;
}) {
  const [showPassword, setShowPassword] = React.useState(false);
  const toChoices = (options: IncaOption[]) => options.map((option) => ({ value: option.code, label: option.label }));
  const areaChoices = ctx.options.service_areas.map((option) => ({ value: option.label, label: option.label }));
  const sub = ctx.subscriber;
  const detectedType = ctx.options.device_types.find((type) => type.code === form.detection?.device_type);
  const showSerial = action !== "RELOCATION" || form.newOnt;
  const showDevice =
    action === "NEW_CONNECTION" || action === "ONT_REPLACEMENT" || (action === "RELOCATION" && form.newOnt);

  return (
    <SheetBody>
      {!ctx.inca.available ? (
        <InlineBanner
          tone="error"
          message="INCA is unreachable. You can fill the form but cannot start until it is back."
        />
      ) : null}
      <p className="text-sm leading-5 text-gray2">{ACTION_META[action].hint}</p>

      <SheetCard>
        <Fact label="Customer" value={ctx.customer_name} />
        {action !== "NEW_CONNECTION" && sub ? (
          <>
            <Fact label="Terminal node" value={sub.terminal_node_id} />
            <Fact label="Current ONT" value={sub.onu_serials.join(", ")} />
            <Fact label="Package" value={sub.package} />
            <Fact label="PPPoE user" value={sub.pppoe_username} />
          </>
        ) : null}
        {action === "NEW_CONNECTION" ? (
          <>
            <Fact label="Client identifier" value={ctx.client_identifier} />
            <Fact label="Address" value={ctx.address} />
            <Fact label="PPPoE / Connected" value="ON · enabled on creation" />
          </>
        ) : null}
      </SheetCard>
      {action !== "NEW_CONNECTION" && !sub ? (
        <InlineBanner
          tone="warning"
          message="No existing INCA subscriber was found for this customer. INCA will reject the request."
        />
      ) : null}

      {action === "RELOCATION" ? (
        <>
          <Field label="New address" error={errors.address}>
            <textarea
              className="textarea min-h-[88px]"
              value={form.address}
              onChange={(event) => onChange({ address: event.target.value })}
              placeholder="Destination address"
              maxLength={300}
            />
          </Field>
          <SheetCard className="flex-row items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">New ONT installed</p>
              <p className="text-xs text-gray2">Turn on if you are fitting a different ONT at the new address.</p>
            </div>
            <Switch checked={form.newOnt} onChange={(newOnt) => onChange({ newOnt })} label="New ONT installed" />
          </SheetCard>
        </>
      ) : null}

      {action === "NEW_CONNECTION" || action === "RELOCATION" ? (
        <Field
          label={action === "RELOCATION" ? "Destination service area" : "Service area"}
          error={errors.serviceArea}
        >
          <ChipSelect
            options={areaChoices}
            value={form.serviceArea}
            onChange={(serviceArea) => onChange({ serviceArea })}
          />
        </Field>
      ) : null}

      {showSerial ? (
        <Field
          label={
            action === "SIGNAL_CHECK"
              ? "ONT serial (confirm)"
              : action === "ONT_REPLACEMENT"
                ? "Replacement ONT serial"
                : "ONT serial"
          }
          error={errors.serial}
          hint={action === "SIGNAL_CHECK" ? "Leave as is to read the ONT on the customer record." : undefined}
        >
          <SerialInput
            value={form.serial}
            error={!!errors.serial}
            onChange={(serial) => onChange({ serial })}
            onScan={onScan}
          />
        </Field>
      ) : null}

      {needsDetection(action) ? (
        <DetectionCard
          title={
            action === "RELOCATION" && !form.newOnt
              ? `Detect ONT ${sub?.onu_serials[0] ?? ""} at the destination`
              : "OLT / PON detection"
          }
          detection={form.detection}
          confirmed={form.oltConfirmed}
          detecting={detecting}
          error={errors.detection}
          onDetect={onDetect}
          onConfirm={(oltConfirmed) => onChange({ oltConfirmed })}
        />
      ) : null}

      {showDevice ? (
        <Field
          label="Device type"
          error={errors.deviceType}
          hint={detectedType ? `Auto-detected by INCA: ${detectedType.label}` : undefined}
        >
          <ChipSelect
            options={toChoices(ctx.options.device_types)}
            value={form.deviceType}
            onChange={(deviceType) => onChange({ deviceType })}
          />
        </Field>
      ) : null}

      {action === "NEW_CONNECTION" ? (
        <>
          <Field label="Package" error={errors.package}>
            <ChipSelect
              options={toChoices(ctx.options.packages)}
              value={form.package}
              onChange={(pkg) => onChange({ package: pkg })}
            />
          </Field>
          <Field label="PPPoE username" error={errors.pppoeUsername}>
            <input
              className={cn("input", errors.pppoeUsername && "border-error")}
              value={form.pppoeUsername}
              onChange={(event) => onChange({ pppoeUsername: event.target.value })}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={64}
            />
          </Field>
          <Field
            label="PPPoE password"
            error={errors.pppoePassword}
            hint="Optional. Sent to INCA only, never stored in Tiketify."
          >
            <div className="flex gap-2">
              <input
                className={cn("input flex-1", errors.pppoePassword && "border-error")}
                type={showPassword ? "text" : "password"}
                value={form.pppoePassword}
                onChange={(event) => onChange({ pppoePassword: event.target.value })}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="new-password"
                maxLength={64}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-tertiary bg-white"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-primary" />
                ) : (
                  <Eye className="h-5 w-5 text-primary" />
                )}
              </button>
            </div>
          </Field>
        </>
      ) : null}

      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2.5",
          pendingCount ? "bg-white text-gray2" : "bg-success-bg text-success",
        )}
      >
        {pendingCount ? <Circle className="h-[18px] w-[18px]" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
        <span className="text-[13px] font-semibold">
          {pendingCount
            ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} left before you can provision`
            : action === "SIGNAL_CHECK"
              ? "Ready to read the signal"
              : "Ready to provision"}
        </span>
      </div>
    </SheetBody>
  );
}

function DetectionCard({
  title,
  detection,
  confirmed,
  detecting,
  error,
  onDetect,
  onConfirm,
}: {
  title: string;
  detection: OntDetection | null;
  confirmed: boolean;
  detecting: boolean;
  error?: string;
  onDetect: () => void;
  onConfirm: (value: boolean) => void;
}) {
  const tone =
    detection?.status === "NOT_DETECTED"
      ? { className: "text-error", icon: XCircle }
      : detection?.status === "REGISTERED"
        ? { className: "text-info", icon: Info }
        : { className: "text-success", icon: CheckCircle2 };
  const ToneIcon = tone.icon;
  return (
    <SheetCard className={cn(error && "border-error")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <button
          type="button"
          onClick={onDetect}
          disabled={detecting}
          aria-label="Detect ONT in INCA"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-tertiary px-3 py-1.5 disabled:opacity-60"
        >
          {detecting ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Search className="h-4 w-4 text-primary" />
          )}
          <span className="text-[13px] font-semibold text-primary">{detection ? "Detect again" : "Detect"}</span>
        </button>
      </div>
      {detection ? (
        <>
          <div className="flex items-start gap-2">
            <ToneIcon className={cn("mt-px h-[18px] w-[18px] shrink-0", tone.className)} />
            <p className={cn("text-[13px] font-medium", tone.className)}>{detection.message}</p>
          </div>
          <Fact label="OLT" value={detection.olt_id} />
          <Fact label="PON" value={detection.pon} />
          <Fact label="Terminal node" value={detection.terminal_node_id} />
          {detection.status === "UNREGISTERED" ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={confirmed}
              onClick={() => onConfirm(!confirmed)}
              className="mt-1 flex items-center gap-2 text-left"
            >
              {confirmed ? (
                <CheckSquare className="h-[22px] w-[22px] shrink-0 text-primary" />
              ) : (
                <Square className="h-[22px] w-[22px] shrink-0 text-gray2" />
              )}
              <span className="text-[13px] font-medium text-ink">
                I confirm this is the correct OLT / PON for the customer
              </span>
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-gray2">Checks INCA Active Devices for where the ONT is connected.</p>
      )}
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </SheetCard>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {error ? <p className="text-xs text-error">{error}</p> : hint ? <p className="text-xs text-gray2">{hint}</p> : null}
    </div>
  );
}

function RunView({
  run,
  range,
  onUpdated,
  onOpenInventory,
}: {
  run: ProvisioningTransaction;
  range: { min_dbm: number; max_dbm: number };
  onUpdated: (run: ProvisioningTransaction) => void;
  onOpenInventory: () => void;
}) {
  const { token } = useSession();
  const [retryPassword, setRetryPassword] = React.useState("");
  const [retrying, setRetrying] = React.useState(false);
  const [actionTaken, setActionTaken] = React.useState("");
  const [readingAfter, setReadingAfter] = React.useState(false);
  const [serviceConfirmed, setServiceConfirmed] = React.useState(false);

  const stages: ProvisioningStatus[] = run.action === "SIGNAL_CHECK" ? ["VALIDATING", "VERIFYING"] : PIPELINE;
  const attemptSteps = run.steps.filter((step) => step.attempt === run.attempts);
  const pointer =
    run.status === "SUCCEEDED"
      ? stages.length
      : stages.indexOf((run.status === "FAILED" ? run.failed_stage : run.status) ?? "VALIDATING");
  const unavailable = run.error_message?.startsWith("INCA unavailable");
  const result = run.result;

  const retry = async () => {
    setRetrying(true);
    try {
      const next: ProvisioningTransaction = await apiPost(
        `/provisioning/transactions/${run.id}/retry`,
        retryPassword ? { pppoe_password: retryPassword } : {},
        token,
      );
      setRetryPassword("");
      onUpdated(next);
    } catch (err: any) {
      showError(err?.message || "Could not retry");
    } finally {
      setRetrying(false);
    }
  };

  const takeAfter = async () => {
    setReadingAfter(true);
    try {
      const next: ProvisioningTransaction = await apiPost(
        `/provisioning/transactions/${run.id}/signal-after`,
        { action_taken: actionTaken.trim(), service_confirmed: serviceConfirmed },
        token,
      );
      setActionTaken("");
      setServiceConfirmed(false);
      showSuccess("After reading recorded");
      onUpdated(next);
    } catch (err: any) {
      showError(err?.message || "Could not read the signal");
    } finally {
      setReadingAfter(false);
    }
  };

  const serviceWorking = (confirmed?: boolean | null) => (confirmed ? "Confirmed" : "Not confirmed");

  return (
    <SheetBody>
      <SheetCard>
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-ink">{run.action_label}</p>
          <StatusPill run={run} />
        </div>
        <Fact label="ONT serial" value={run.ont_serial} />
        <Fact label="Replaced ONT" value={run.old_ont_serial} />
        <Fact label="Started" value={moment(run.started_at).format("D MMM, HH:mm")} />
        <Fact label="Attempt" value={run.attempts > 1 ? String(run.attempts) : null} />
        <Fact label="Technician" value={run.technician.name} />
      </SheetCard>

      <SectionTitle>Progress</SectionTitle>
      <SheetCard className="gap-0">
        {stages.map((stage, index) => {
          const state: StageState =
            index < pointer
              ? "done"
              : index === pointer
                ? run.status === "FAILED"
                  ? "failed"
                  : run.in_progress
                    ? "active"
                    : "done"
                : "pending";
          const messages = attemptSteps.filter((step) => step.stage === stage);
          return (
            <div key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StageDot state={state} />
                {index < stages.length - 1 ? (
                  <div className={cn("min-h-[16px] w-0.5 flex-1", state === "done" ? "bg-success" : "bg-borderlight")} />
                ) : null}
              </div>
              <div className="flex-1 pb-4 pt-0.5">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    state === "pending" ? "text-gray3" : state === "failed" ? "text-error" : "text-ink",
                  )}
                >
                  {STAGE_LABELS[stage]}
                </p>
                {messages.map((step) => (
                  <p key={step.id} className={cn("mt-0.5 text-xs", step.ok ? "text-gray2" : "text-error")}>
                    {step.message}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </SheetCard>

      {run.status === "FAILED" ? (
        <SheetCard className="border-error/40 bg-error-bg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-error" />
            <p className="text-sm font-bold text-error">
              {unavailable ? "INCA integration error" : `Failed at ${run.failed_stage_label ?? "a stage"}`}
            </p>
          </div>
          <p className="text-[13px] text-ink">{run.error_message}</p>
          {run.finished_at ? (
            <p className="text-xs text-gray2">{moment(run.finished_at).format("D MMM, HH:mm:ss")}</p>
          ) : null}
          {run.can_retry ? (
            <>
              <p className="text-xs text-gray2">
                Retry continues from the current INCA state; finished steps are not repeated.
              </p>
              {run.action === "NEW_CONNECTION" && run.submitted?.pppoe_password_provided ? (
                <input
                  className="input"
                  type="password"
                  value={retryPassword}
                  onChange={(event) => setRetryPassword(event.target.value)}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  placeholder="Re-enter PPPoE password (not stored)"
                  maxLength={64}
                />
              ) : null}
              <PrimaryButton text="Retry" onClick={retry} loading={retrying} />
            </>
          ) : (
            <p className="text-xs text-gray2">A newer run exists for this action. Retry that one instead.</p>
          )}
        </SheetCard>
      ) : null}

      {run.status === "SUCCEEDED" && result ? (
        <>
          <SectionTitle>Result</SectionTitle>
          <SheetCard>
            <Fact label="Terminal node" value={result.terminal_node_id} />
            <Fact label="OLT / PON" value={[result.olt_id, result.pon].filter(Boolean).join(" · ")} />
            <Fact label="Service area" value={result.service_area} />
            <Fact label="Package" value={result.package} />
            <Fact label="PPPoE user" value={result.pppoe_username} />
            <Fact
              label="Recovered ONT"
              value={result.recovered_ont_serial ? `${result.recovered_ont_serial} · return to store` : null}
            />
          </SheetCard>
          {result.optical ? (
            <SignalReadout title="Optical signal" reading={result.optical} range={result.range ?? range} />
          ) : null}
          {run.installs_ont && run.ont_serial ? (
            <InlineBanner
              tone="info"
              icon={Box}
              message={`ONT ${run.ont_serial} is ready to record in inventory.`}
              actionLabel="Open inventory"
              onAction={onOpenInventory}
            />
          ) : null}
        </>
      ) : null}

      {run.action === "SIGNAL_CHECK" && run.status === "SUCCEEDED" && result ? (
        <>
          <SignalReadout title="Before" reading={result.before ?? null} range={result.range ?? range} />
          {result.after !== null && result.after !== undefined ? (
            <>
              <SignalReadout title="After" reading={result.after} range={result.range ?? range} />
              <SheetCard>
                <Fact label="Action taken" value={result.action_taken} />
                <Fact label="Service working" value={serviceWorking(result.service_confirmed)} />
              </SheetCard>
            </>
          ) : result.action_taken ? (
            <SheetCard>
              <Fact label="Action taken" value={result.action_taken} />
              <Fact label="Service working" value={serviceWorking(result.service_confirmed)} />
              <p className="text-xs text-gray2">No optical reading after the fix.</p>
            </SheetCard>
          ) : (
            <SheetCard>
              <p className="text-sm font-semibold text-ink">After your fix</p>
              <p className="text-xs text-gray2">Describe what you did, then take the after reading.</p>
              <textarea
                className="textarea min-h-[88px]"
                value={actionTaken}
                onChange={(event) => setActionTaken(event.target.value)}
                placeholder="e.g. Re-terminated drop cable connector"
                maxLength={500}
              />
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">Service working</p>
                  <p className="text-xs text-gray2">Confirm the customer&apos;s internet works after the fix.</p>
                </div>
                <Switch checked={serviceConfirmed} onChange={setServiceConfirmed} label="Service working" />
              </div>
              <PrimaryButton
                text="Take after reading"
                onClick={takeAfter}
                loading={readingAfter}
                disabled={actionTaken.trim().length < 3}
              />
            </SheetCard>
          )}
        </>
      ) : null}
    </SheetBody>
  );
}

type StageState = "done" | "active" | "failed" | "pending";

function StageDot({ state }: { state: StageState }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
        state === "done" && "border-success bg-success",
        state === "failed" && "border-error bg-error",
        state === "active" && "border-info bg-info",
        state === "pending" && "border-borderlight bg-white",
      )}
    >
      {state === "active" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
      ) : state === "done" ? (
        <Check className="h-3.5 w-3.5 text-white" />
      ) : state === "failed" ? (
        <X className="h-3.5 w-3.5 text-white" />
      ) : null}
    </span>
  );
}

function SignalReadout({
  title,
  reading,
  range,
}: {
  title: string;
  reading: OpticalReading | null;
  range: { min_dbm: number; max_dbm: number };
}) {
  const result = reading?.result ?? "NO_READING";
  const tone =
    result === "WITHIN_RANGE"
      ? { fg: "text-success", pill: "bg-success-bg text-success", text: "Within range" }
      : result === "OUTSIDE_RANGE"
        ? { fg: "text-warning", pill: "bg-warning-bg text-warning", text: "Outside range" }
        : { fg: "text-error", pill: "bg-error-bg text-error", text: "No reading" };
  return (
    <SheetCard>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <Pill className={tone.pill}>{tone.text}</Pill>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-[32px] font-bold leading-none", tone.fg)}>{reading?.rx_dbm ?? "—"}</span>
        <span className="text-sm font-semibold text-gray2">dBm Rx</span>
      </div>
      <p className="text-xs text-gray2">
        Accepted range {range.min_dbm} to {range.max_dbm} dBm
      </p>
      {reading ? (
        <>
          <Fact label="Tx" value={reading.tx_dbm !== null ? `${reading.tx_dbm} dBm` : null} />
          <Fact label="OLT Rx" value={reading.olt_rx_dbm !== null ? `${reading.olt_rx_dbm} dBm` : null} />
          <Fact label="Status" value={reading.online ? "Online" : "Offline"} />
          <Fact label="Alarms" value={reading.alarms.join(", ") || "None"} />
          <Fact label="Read at" value={moment(reading.read_at).format("HH:mm:ss")} />
        </>
      ) : null}
    </SheetCard>
  );
}
