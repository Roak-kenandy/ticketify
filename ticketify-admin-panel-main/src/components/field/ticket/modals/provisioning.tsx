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
import { SwitchRow } from "@/components/field/ui/switch";
import WorkflowSheet, {
  Fact,
  SectionTitle,
  SelectInput,
  SheetBody,
  SheetCard,
  SheetCenter,
} from "@/components/field/ui/workflow-sheet";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { showError, showInfo, showSuccess } from "@/lib/field/notify";
import { canonicalSerial, isValidSerial, normalizeSerial } from "@/lib/field/serial";
import { issuedSerials, useMyStock } from "@/lib/field/stock";
import { useSession } from "@/lib/field/session";
import type {
  IncaOption,
  IncaSubscriberLookup,
  IncaSubscriberView,
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
  newOnt: boolean;
  /** Last Active Device lookup for the ONT being provisioned. */
  detection: OntDetection | null;
  oltConfirmed: boolean;
  /** Replacement: the ONT being replaced, and the INCA Terminal Node it is attached to. */
  oldSerial: string;
  oldLookup: IncaSubscriberLookup | null;
  /** New connection: the INCA Terminal Node and, when missing, its client / city / street. */
  tnName: string;
  tnNumber: string;
  tnIdentity: string;
  tnClientName: string;
  /** INCA client lookup for tnIdentity; null until it has run. */
  tnClient: { identity: string; found: boolean; name: string | null } | null;
  tnCityId: string | null;
  tnAddCity: boolean;
  tnNewCity: string;
  tnAreaCode: string;
  tnStreetId: string | null;
  tnAddStreet: boolean;
  tnNewStreet: string;
  tnPhone: string;
  tnEmail: string;
};

const NEW_OPTION = "__new__";
const IDENTITY_PATTERN = /^[A-Za-z0-9-]{3,30}$/;

/** The CRM contact's ID card number, when INCA can use it as the client identity. */
function crmIdentity(ctx: ProvisioningContext): string | null {
  const value = ctx.crm_identity?.trim().toUpperCase();
  return value && IDENTITY_PATTERN.test(value) ? value : null;
}

const POLL_MS = 2000;
const PIPELINE: ProvisioningStatus[] = ["VALIDATING", "REGISTERING_ONT", "APPLYING_CONFIG", "WAITING_TODO", "VERIFYING"];
const STAGE_LABELS: Record<string, string> = {
  VALIDATING: "Validating",
  REGISTERING_ONT: "Registering ONT",
  APPLYING_CONFIG: "Terminal node, ONU & package",
  WAITING_TODO: "Waiting for INCA Todo",
  VERIFYING: "Optical info",
};
const ACTION_META: Record<ProvisioningAction, { icon: LucideIcon; hint: string }> = {
  NEW_CONNECTION: {
    icon: PlusCircle,
    hint: "Register the ONT, create the Terminal Node (adding the client, city or street if missing), attach the ONU, assign the package, set Connected and read the optical info.",
  },
  ONT_REPLACEMENT: {
    icon: ArrowLeftRight,
    hint: "Swap the faulty ONT and keep the customer's existing service.",
  },
  RELOCATION: {
    icon: Navigation,
    hint: "Move the customer's Terminal Node to the new address, keeping the package and PPPoE. Detect at the destination decides whether the ONT stays as it is or is re-added on the new OLT / PON.",
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
  const { stock } = useMyStock(visible);

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
    const relocating = next === "RELOCATION";
    setAction(next);
    setShowErrors(false);
    setForm({
      ...emptyForm(),
      serial: next === "SIGNAL_CHECK" ? (sub?.onu_serials[0] ?? "") : "",
      oldSerial: next === "ONT_REPLACEMENT" || relocating ? (sub?.onu_serials[0] ?? "") : "",
      serviceArea: ctx.suggested.service_area,
      package: next === "NEW_CONNECTION" ? null : (sub?.package ?? null),
      pppoeUsername: ctx.suggested.pppoe_username ?? "",
      deviceType: ctx.options.device_types.length === 1 ? ctx.options.device_types[0].code : null,
      tnName: ctx.suggested.terminal_node?.name ?? ctx.customer_name ?? "",
      tnClientName: ctx.customer_name ?? "",
      tnIdentity: crmIdentity(ctx) ?? "",
      tnPhone: ctx.suggested.terminal_node?.phone ?? "",
      ...(relocating
        ? currentLocation(sub)
        : {
            tnNumber: ctx.suggested.terminal_node?.number ?? "",
            tnCityId: ctx.suggested.terminal_node?.city_id ?? null,
          }),
    });
    setView("form");
  };

  const formErrors = action && ctx ? validate(action, form, ctx) : {};

  const updateForm = (patch: Partial<Form>) =>
    setForm((current) => {
      let next = { ...current, ...patch };
      // Live INCA finds the customer by the current ONT; prefill the destination from it once.
      if (action === "RELOCATION" && patch.oldLookup?.subscriber && !current.tnCityId && !current.tnAddCity) {
        next = { ...next, ...currentLocation(patch.oldLookup.subscriber) };
      }
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
          old_ont_serial:
            action === "ONT_REPLACEMENT" || action === "RELOCATION"
              ? normalizeSerial(form.oldSerial) || undefined
              : undefined,
          device_type:
            action === "SIGNAL_CHECK" || (action === "RELOCATION" && !form.newOnt)
              ? undefined
              : (form.deviceType ?? undefined),
          service_area: action === "NEW_CONNECTION" ? (form.serviceArea ?? undefined) : undefined,
          package: action === "NEW_CONNECTION" ? (form.package ?? undefined) : undefined,
          pppoe_username: ctx && asksPppoe(ctx, form, action) ? form.pppoeUsername.trim() : undefined,
          pppoe_password:
            ctx && asksPppoe(ctx, form, action) && form.pppoePassword ? form.pppoePassword : undefined,
          new_ont: action === "RELOCATION" ? form.newOnt : undefined,
          terminal_node: action === "NEW_CONNECTION" ? terminalNodePayload(form) : undefined,
          location: action === "RELOCATION" ? locationPayload(form) : undefined,
          ...(form.detection && confirmsOlt(action, form, form.detection) && form.oltConfirmed
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
          ticketId={ticketId}
          ctx={ctx}
          action={action}
          form={form}
          errors={showErrors ? formErrors : {}}
          pendingCount={Object.keys(formErrors).length}
          detecting={detecting}
          onChange={updateForm}
          onScan={() => setScanning(true)}
          onDetect={detect}
          issued={stock?.restricted ? issuedSerials(stock) : null}
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
    newOnt: false,
    detection: null,
    oltConfirmed: false,
    oldSerial: "",
    oldLookup: null,
    tnName: "",
    tnNumber: "",
    tnIdentity: "",
    tnClientName: "",
    tnClient: null,
    tnCityId: null,
    tnAddCity: false,
    tnNewCity: "",
    tnAreaCode: "",
    tnStreetId: null,
    tnAddStreet: false,
    tnNewStreet: "",
    tnPhone: "",
    tnEmail: "",
  };
}

/** The Terminal Node's current INCA address, as the starting point for the destination. */
function currentLocation(sub: IncaSubscriberView | null | undefined): Partial<Form> {
  const location = sub?.location;
  return {
    tnCityId: location?.city_id ?? null,
    tnStreetId: location?.street_id ?? null,
    tnNumber: location?.number ?? "",
  };
}

function locationPayload(form: Form) {
  const addStreet = form.tnAddCity || form.tnAddStreet;
  return {
    number: form.tnNumber.trim(),
    city_id: form.tnAddCity ? undefined : (form.tnCityId ?? undefined),
    new_city_name: form.tnAddCity ? form.tnNewCity.trim() : undefined,
    new_city_area_code: form.tnAddCity ? form.tnAreaCode.trim() : undefined,
    street_id: addStreet ? undefined : (form.tnStreetId ?? undefined),
    new_street_name: addStreet ? form.tnNewStreet.trim() : undefined,
  };
}

function terminalNodePayload(form: Form) {
  const optional = (value: string) => value.trim() || undefined;
  const identity = form.tnIdentity.trim().toUpperCase();
  const existing = form.tnClient?.identity === identity && form.tnClient.found ? form.tnClient : null;
  return {
    ...locationPayload(form),
    name: form.tnName.trim(),
    client_identity: identity,
    client_name: (existing?.name || form.tnClientName).trim(),
    phone: optional(form.tnPhone),
    email: optional(form.tnEmail),
  };
}

type FormErrors = Partial<Record<keyof Form, string>>;

/** The ONT will be registered in INCA on the detected OLT, so the technician confirms it. */
function needsOltConfirm(detection: OntDetection) {
  return detection.status === "UNREGISTERED";
}

/** Relocating the same ONT to a new OLT / PON moves it there, so that port is confirmed too. */
function relocatesOnt(action: ProvisioningAction, form: Form, detection: OntDetection) {
  return action === "RELOCATION" && !form.newOnt && detection.olt_state === "UNREGISTERED";
}

function confirmsOlt(action: ProvisioningAction, form: Form, detection: OntDetection) {
  return needsOltConfirm(detection) || relocatesOnt(action, form, detection);
}

function needsDetection(action: ProvisioningAction) {
  return action !== "SIGNAL_CHECK";
}

/** Relocation without a new ONT detects the customer's current ONT at the destination. */
function detectionSerial(action: ProvisioningAction, form: Form, ctx: ProvisioningContext) {
  return action === "RELOCATION" && !form.newOnt
    ? normalizeSerial(form.oldSerial) || (ctx.subscriber?.onu_serials[0] ?? "")
    : form.serial;
}

/** What the relocation will do with the ONT, from where Detect found it. */
function relocationNote(action: ProvisioningAction, form: Form, detection: OntDetection | null) {
  if (action !== "RELOCATION" || form.newOnt || !detection || detection.status !== "REGISTERED") {
    return null;
  }
  const where = `${detection.olt_name ?? detection.olt_id ?? "the OLT"} PON ${detection.pon ?? "-"}`;
  return detection.olt_state === "UNREGISTERED"
    ? `The ONT is now on ${where}. It will be revoked, moved to this OLT in INCA and added back to the same customer.`
    : `The ONT is still on ${where}. Only the address changes; the ONU binding stays as it is.`;
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
  if (action === "ONT_REPLACEMENT" || action === "RELOCATION") {
    const current = normalizeSerial(form.oldSerial);
    if (!current) {
      if (currentOntRequired(ctx)) errors.oldSerial = "Enter the serial of the customer's current ONT";
    } else if (!isValidSerial(current)) {
      errors.oldSerial = "Not a valid serial number";
    } else if (current === normalizeSerial(form.serial) && (action === "ONT_REPLACEMENT" || form.newOnt)) {
      errors.serial = "The new ONT must be a different device";
    } else if (currentOntRequired(ctx)) {
      const lookup = form.oldLookup?.serial === current ? form.oldLookup : null;
      if (!lookup) errors.oldSerial = "Checking INCA for this ONT…";
      else if (!lookup.found) errors.oldSerial = "This ONT is not attached to any Terminal Node in INCA";
    }
  }
  if (action === "NEW_CONNECTION" && ctx.options.service_areas.length > 0 && !form.serviceArea) {
    errors.serviceArea = "Choose the service area";
  }
  if (action === "RELOCATION") {
    Object.assign(errors, validateLocation(form));
  }
  if (action === "NEW_CONNECTION") {
    if (ctx.options.packages.length > 0 && !form.package) {
      errors.package = "Choose the package";
    }
    Object.assign(errors, validateTerminalNode(form));
  }
  if (asksPppoe(ctx, form, action)) {
    if (!/^[A-Za-z0-9._@-]{3,64}$/.test(form.pppoeUsername.trim())) {
      errors.pppoeUsername = "Use 3–64 letters, digits or . _ @ -";
    }
    if (operatorPppoe(form) && !form.pppoePassword) {
      errors.pppoePassword = "Required for this ONT";
    } else if (form.pppoePassword && form.pppoePassword.length < 6) {
      errors.pppoePassword = "At least 6 characters";
    }
  }
  if (needsDetection(action) && !errors.serial) {
    const serial = normalizeSerial(detectionSerial(action, form, ctx));
    const detection = form.detection;
    if (!detection || canonicalSerial(detection.serial) !== canonicalSerial(serial)) {
      errors.detection = "Detect the ONT to confirm its OLT / PON";
    } else if (detection.status === "NOT_DETECTED") {
      errors.detection = "ONT is not detected on any OLT";
    } else if (detection.status === "OLT_REGISTERED") {
      errors.detection = "ONT is still configured on the OLT; have the NOC remove it, then detect again";
    } else if (confirmsOlt(action, form, detection) && !form.oltConfirmed) {
      errors.detection = "Confirm the detected OLT / PON";
    }
  }
  return errors;
}

/** Live INCA asks for PPPoE only for operator-firmware ONTs; older servers omit the flag. */
function pppoeRequired(ctx: ProvisioningContext) {
  return ctx.inca.pppoe_required ?? true;
}

/** Detect found operator firmware (e.g. Ooredoo) on the ONT being installed. */
function operatorPppoe(form: Form) {
  return form.detection?.pppoe_required === true && canonicalSerial(form.detection.serial) === canonicalSerial(form.serial);
}

/**
 * New connection: whenever PPPoE applies. Replacement, or relocation with a new ONT: only an
 * operator ONT going onto a Terminal Node that has no PPPoE yet; existing PPPoE is kept.
 */
function asksPppoe(ctx: ProvisioningContext, form: Form, action: ProvisioningAction) {
  if (action === "NEW_CONNECTION") {
    return pppoeRequired(ctx) || operatorPppoe(form);
  }
  const installsOnt = action === "ONT_REPLACEMENT" || (action === "RELOCATION" && form.newOnt);
  if (!installsOnt || !operatorPppoe(form)) {
    return false;
  }
  const looked =
    form.oldLookup && canonicalSerial(form.oldLookup.serial) === canonicalSerial(form.oldSerial) ? form.oldLookup : null;
  const sub = looked?.subscriber ?? ctx.subscriber;
  return Boolean(sub) && !(sub?.pppoe_configured ?? Boolean(sub?.pppoe_username));
}

function PppoeFields({
  form,
  errors,
  onChange,
}: {
  form: Form;
  errors: Partial<Record<keyof Form | "detection", string>>;
  onChange: (patch: Partial<Form>) => void;
}) {
  const [showPassword, setShowPassword] = React.useState(false);
  const operatorOnt = operatorPppoe(form);
  return (
    <>
      {operatorOnt ? (
        <InlineBanner
          tone="info"
          message={`${form.detection?.operator ?? "Operator"} ONT: it only gets service over PPPoE. Enter the customer's PPPoE username and password.`}
        />
      ) : null}
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
        hint={
          operatorOnt
            ? "Required. Sent to INCA only, never stored in Tiketify."
            : "Optional. Sent to INCA only, never stored in Tiketify."
        }
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
            {showPassword ? <EyeOff className="h-5 w-5 text-primary" /> : <Eye className="h-5 w-5 text-primary" />}
          </button>
        </div>
      </Field>
    </>
  );
}

function currentOntRequired(ctx: ProvisioningContext) {
  return ctx.inca.current_ont_required ?? false;
}

function validateTerminalNode(form: Form): FormErrors {
  const errors: FormErrors = validateLocation(form);
  const identity = form.tnIdentity.trim().toUpperCase();
  if (!IDENTITY_PATTERN.test(identity)) {
    errors.tnIdentity = "Enter the customer's ID card or passport number";
  } else if (form.tnClient?.identity !== identity) {
    errors.tnIdentity = "Checking INCA for this client…";
  } else if (!form.tnClient.found && form.tnClientName.trim().length < 2) {
    errors.tnClientName = "Enter the client name for the new INCA client";
  }
  if (form.tnName.trim().length < 2) {
    errors.tnName = "Enter the terminal node name";
  }
  if (form.tnPhone.trim() && !/^\+?[0-9 -]{3,20}$/.test(form.tnPhone.trim())) {
    errors.tnPhone = "Digits, spaces, + and - only";
  }
  if (form.tnEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.tnEmail.trim())) {
    errors.tnEmail = "Not a valid e-mail";
  }
  return errors;
}

function validateLocation(form: Form): FormErrors {
  const errors: FormErrors = {};
  if (form.tnAddCity) {
    if (form.tnNewCity.trim().length < 2) errors.tnNewCity = "Enter the city name";
    if (!/^\d{1,10}$/.test(form.tnAreaCode.trim())) errors.tnAreaCode = "Area code must be digits";
  } else if (!form.tnCityId) {
    errors.tnCityId = "Choose the city";
  }
  if (form.tnAddCity || form.tnAddStreet) {
    if (form.tnNewStreet.trim().length < 2) errors.tnNewStreet = "Enter the street name";
  } else if (!form.tnStreetId) {
    errors.tnStreetId = "Choose the street";
  }
  if (!/^\d{1,15}$/.test(form.tnNumber.trim())) {
    errors.tnNumber = "Number must be digits";
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
  ticketId,
  ctx,
  action,
  form,
  errors,
  pendingCount,
  detecting,
  onChange,
  onScan,
  onDetect,
  issued,
}: {
  ticketId: string;
  ctx: ProvisioningContext;
  action: ProvisioningAction;
  form: Form;
  errors: FormErrors;
  pendingCount: number;
  detecting: boolean;
  onChange: (patch: Partial<Form>) => void;
  onScan: () => void;
  onDetect: () => void;
  /** ONTs issued to a technician who may only install those; null = any serial. */
  issued: { serial: string; itemName: string }[] | null;
}) {
  const toChoices = toOptions;
  const areaChoices = ctx.options.service_areas.map((option) => ({ value: option.label, label: option.label }));
  const replacing = action === "ONT_REPLACEMENT";
  const relocating = action === "RELOCATION";
  const looked =
    (replacing || relocating) && form.oldLookup && canonicalSerial(form.oldLookup.serial) === canonicalSerial(form.oldSerial)
      ? form.oldLookup
      : null;
  const sub = looked?.subscriber ?? ctx.subscriber;
  const detectedType = ctx.options.device_types.find((type) => type.code === form.detection?.device_type);
  const showSerial = action !== "RELOCATION" || form.newOnt;
  const showDevice =
    action === "NEW_CONNECTION" || action === "ONT_REPLACEMENT" || (action === "RELOCATION" && form.newOnt);

  let step = 0;
  const nextStep = () => ++step;
  const askPppoe = asksPppoe(ctx, form, action);
  const showService =
    action === "NEW_CONNECTION" && (areaChoices.length > 0 || ctx.options.packages.length > 0 || askPppoe);

  return (
    <SheetBody className="gap-4">
      {!ctx.inca.available ? (
        <InlineBanner
          tone="error"
          message="INCA is unreachable. You can fill the form but cannot start until it is back."
        />
      ) : null}

      <SheetCard className="gap-1">
        <p className="text-[15px] font-semibold text-ink">{ctx.customer_name}</p>
        {ctx.address ? <p className="text-xs leading-4 text-gray2">{ctx.address}</p> : null}
        <p className="mt-2 text-[13px] leading-5 text-gray2">{ACTION_META[action].hint}</p>
        {action !== "NEW_CONNECTION" && sub ? (
          <div className="mt-2 border-t border-borderlight pt-2">
            <Fact label="Terminal node" value={sub.terminal_node_id} />
            <Fact label="Current ONT" value={sub.onu_serials.join(", ")} />
            {relocating ? <Fact label="Current address" value={sub.address} /> : null}
            <Fact label="Package" value={sub.package} />
            <Fact label="PPPoE user" value={sub.pppoe_username} />
          </div>
        ) : null}
      </SheetCard>
      {action !== "NEW_CONNECTION" && !sub && !((replacing || relocating) && currentOntRequired(ctx)) ? (
        <InlineBanner
          tone="warning"
          message="No existing INCA subscriber was found for this customer. INCA will reject the request."
        />
      ) : null}

      {replacing || relocating ? (
        <CurrentOntSection
          step={nextStep()}
          ticketId={ticketId}
          form={form}
          errors={errors}
          required={currentOntRequired(ctx)}
          subtitle={
            relocating
              ? "The customer's ONT today. It finds their Terminal Node in INCA."
              : "The ONT you are taking off. It is revoked from the customer's Terminal Node."
          }
          onChange={onChange}
        />
      ) : null}

      {relocating ? (
        <FormSection
          step={nextStep()}
          title="Destination"
          subtitle="The new address of the customer's Terminal Node. It starts from the current address."
        >
          <LocationFields ticketId={ticketId} ctx={ctx} form={form} errors={errors} onChange={onChange} withNumber />
          <SwitchRow
            title="New ONT installed"
            hint="Turn on if you are fitting a different ONT at the new address."
            checked={form.newOnt}
            onChange={(newOnt) => onChange({ newOnt })}
          />
        </FormSection>
      ) : null}

      <FormSection
        step={nextStep()}
        title={replacing ? "New ONT" : "ONT"}
        subtitle={
          action === "SIGNAL_CHECK"
            ? "The ONT whose signal you are reading."
            : replacing
              ? "Connect the new ONT, detect it on the OLT and confirm its model."
              : "Detect where the ONT is connected and confirm its model."
        }
      >
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
          hint={
            action === "SIGNAL_CHECK"
              ? sub?.onu_serials[0]
                ? "Leave as is to read the ONT on the customer record."
                : "Scan or type the PON SN printed on the ONT."
              : undefined
          }
        >
          {issued && showDevice ? (
            issued.length ? (
              <SelectInput
                label="ONT serial"
                placeholder="Choose one of your issued ONTs…"
                options={issued.map((unit) => ({ value: unit.serial, label: `${unit.serial} · ${unit.itemName}` }))}
                value={normalizeSerial(form.serial) || null}
                error={!!errors.serial}
                onChange={(serial) => onChange({ serial: serial ?? "" })}
              />
            ) : (
              <InlineBanner
                tone="warning"
                message="No ONTs are issued to you. Ask your supervisor to hand you one before installing."
              />
            )
          ) : (
            <SerialInput
              value={form.serial}
              error={!!errors.serial}
              onChange={(serial) => onChange({ serial })}
              onScan={onScan}
            />
          )}
        </Field>
      ) : null}

      {needsDetection(action) ? (
        <DetectionCard
          title={
            relocating && !form.newOnt
              ? `Detect ONT ${detectionSerial(action, form, ctx)} at the destination`
              : "OLT / PON detection"
          }
          detection={form.detection}
          confirmed={form.oltConfirmed}
          detecting={detecting}
          error={errors.detection}
          note={relocationNote(action, form, form.detection)}
          confirm={Boolean(form.detection && confirmsOlt(action, form, form.detection))}
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
          <SelectInput
            label="Device type"
            placeholder="Choose the device type…"
            options={toChoices(ctx.options.device_types)}
            value={form.deviceType}
            error={!!errors.deviceType}
            onChange={(deviceType) => onChange({ deviceType })}
          />
        </Field>
      ) : null}
      </FormSection>

      {action === "NEW_CONNECTION" ? (
        <TerminalNodeSection
          step={nextStep()}
          ticketId={ticketId}
          ctx={ctx}
          form={form}
          errors={errors}
          onChange={onChange}
        />
      ) : null}

      {showService ? (
        <FormSection step={nextStep()} title="Service" subtitle="Applied to the Terminal Node in INCA.">
          {areaChoices.length > 0 ? (
            <Field label="Service area" error={errors.serviceArea}>
              <SelectInput
                label="Service area"
                placeholder="Choose the service area…"
                options={areaChoices}
                value={form.serviceArea}
                error={!!errors.serviceArea}
                onChange={(serviceArea) => onChange({ serviceArea })}
              />
            </Field>
          ) : null}
          {ctx.options.packages.length > 0 ? (
            <Field label="Package" error={errors.package}>
              <SelectInput
                label="Package"
                placeholder="Choose the package…"
                options={toChoices(ctx.options.packages)}
                value={form.package}
                error={!!errors.package}
                onChange={(pkg) => onChange({ package: pkg })}
              />
            </Field>
          ) : null}
          {askPppoe ? <PppoeFields form={form} errors={errors} onChange={onChange} /> : null}
        </FormSection>
      ) : null}

      {(replacing || relocating) && askPppoe ? (
        <FormSection
          step={nextStep()}
          title="PPPoE"
          subtitle="The customer's Terminal Node has no PPPoE yet. It is set before the new ONT is added."
        >
          <PppoeFields form={form} errors={errors} onChange={onChange} />
        </FormSection>
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

/** Replacement / relocation: the customer's current ONT, and the INCA Terminal Node it identifies. */
function CurrentOntSection({
  step,
  ticketId,
  form,
  errors,
  required,
  subtitle,
  onChange,
}: {
  step: number;
  ticketId: string;
  form: Form;
  errors: FormErrors;
  required: boolean;
  subtitle: string;
  onChange: (patch: Partial<Form>) => void;
}) {
  const { token } = useSession();
  const [lookingUp, setLookingUp] = React.useState(false);
  const serial = normalizeSerial(form.oldSerial);
  const lookup = form.oldLookup && canonicalSerial(form.oldLookup.serial) === canonicalSerial(serial) ? form.oldLookup : null;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    if (!isValidSerial(serial) || lookup) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookingUp(true);
      try {
        const found: IncaSubscriberLookup = await apiGet(
          `/provisioning/tickets/${ticketId}/inca/subscriber?serial=${encodeURIComponent(serial)}`,
          token,
          { silent: true },
        );
        if (!cancelled) onChangeRef.current({ oldLookup: found });
      } catch (err: any) {
        if (!cancelled) showError(err?.message || "Could not check INCA for this ONT");
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLookingUp(false);
    };
  }, [serial, lookup, ticketId, token]);

  const status = lookingUp
    ? { icon: Loader2, spin: true, tone: "text-gray2", text: "Finding the Terminal Node in INCA…" }
    : lookup?.found && lookup.subscriber
      ? {
          icon: CheckCircle2,
          spin: false,
          tone: "text-success",
          text: `On Terminal Node ${lookup.subscriber.terminal_node_id}${lookup.subscriber.package ? ` · ${lookup.subscriber.package}` : ""}`,
        }
      : lookup
        ? { icon: XCircle, spin: false, tone: "text-error", text: "Not attached to any Terminal Node in INCA" }
        : null;
  const StatusIcon = status?.icon;

  return (
    <FormSection step={step} title="Current ONT" subtitle={subtitle}>
      <Field
        label="Current ONT serial"
        error={lookingUp ? undefined : errors.oldSerial}
        hint={required ? undefined : "Leave as is to use the ONT on the customer record."}
      >
        <input
          className={cn("input font-mono uppercase", errors.oldSerial && !lookingUp && "border-error")}
          value={form.oldSerial}
          onChange={(event) => onChange({ oldSerial: event.target.value })}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          placeholder="Serial on the old ONT label"
        />
      </Field>
      {status && StatusIcon ? (
        <div className={cn("-mt-1 flex items-center gap-1.5 text-xs font-medium", status.tone)}>
          <StatusIcon className={cn("h-4 w-4 shrink-0", status.spin && "animate-spin")} />
          <span>{status.text}</span>
        </div>
      ) : null}
    </FormSection>
  );
}

function TerminalNodeSection({
  step,
  ticketId,
  ctx,
  form,
  errors,
  onChange,
}: {
  step: number;
  ticketId: string;
  ctx: ProvisioningContext;
  form: Form;
  errors: FormErrors;
  onChange: (patch: Partial<Form>) => void;
}) {
  const { token } = useSession();
  const [lookingUp, setLookingUp] = React.useState(false);
  const identity = form.tnIdentity.trim().toUpperCase();
  const client = form.tnClient?.identity === identity ? form.tnClient : null;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const lookedUp = form.tnClient?.identity === identity;
  const fromCrm = crmIdentity(ctx);

  React.useEffect(() => {
    if (!IDENTITY_PATTERN.test(identity) || lookedUp) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookingUp(true);
      try {
        const found: { identity: string; found: boolean; name: string | null } = await apiGet(
          `/provisioning/tickets/${ticketId}/inca/clients?identity=${encodeURIComponent(identity)}`,
          token,
          { silent: true },
        );
        if (!cancelled) onChangeRef.current({ tnClient: found });
      } catch {
        // INCA re-checks the identity before creating, so an unknown result never duplicates the client.
        if (!cancelled) onChangeRef.current({ tnClient: { identity, found: false, name: null } });
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLookingUp(false);
    };
  }, [identity, lookedUp, ticketId, token]);

  const input = (key: keyof Form) => cn("input", errors[key] && "border-error");

  const lookup = lookingUp
    ? { icon: Loader2, spin: true, tone: "text-gray2", text: "Checking INCA…" }
    : client?.found
      ? { icon: CheckCircle2, spin: false, tone: "text-success", text: `Existing INCA client: ${client.name || identity}` }
      : client
        ? { icon: PlusCircle, spin: false, tone: "text-info", text: "Not in INCA yet. A new client will be created." }
        : null;
  const LookupIcon = lookup?.icon;

  return (
    <FormSection step={step} title="Terminal node" subtitle="Created in INCA for this customer.">
      <FieldGroup title="Client">
        <Field
          label="ID card / passport number"
          error={lookingUp ? undefined : errors.tnIdentity}
          hint={
            fromCrm
              ? "From the CRM contact."
              : "Not on the CRM contact yet. For a Medianet ONT it is saved to the CRM once provisioning succeeds."
          }
        >
          <input
            className={cn(input("tnIdentity"), "font-mono uppercase", fromCrm && "cursor-not-allowed bg-surface")}
            value={form.tnIdentity}
            readOnly={!!fromCrm}
            onChange={(event) => onChange({ tnIdentity: event.target.value })}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            placeholder="e.g. A123456"
          />
        </Field>
        {lookup && LookupIcon ? (
          <div className={cn("-mt-1 flex items-center gap-1.5 text-xs font-medium", lookup.tone)}>
            <LookupIcon className={cn("h-4 w-4 shrink-0", lookup.spin && "animate-spin")} />
            <span>{lookup.text}</span>
          </div>
        ) : null}
        {client && !client.found ? (
          <Field label="Client name" error={errors.tnClientName}>
            <input
              className={input("tnClientName")}
              value={form.tnClientName}
              onChange={(event) => onChange({ tnClientName: event.target.value })}
              maxLength={120}
            />
          </Field>
        ) : null}
      </FieldGroup>

      <FieldGroup title="Location">
        <LocationFields ticketId={ticketId} ctx={ctx} form={form} errors={errors} onChange={onChange} />
      </FieldGroup>

      <FieldGroup title="Node details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Number" error={errors.tnNumber} hint="Customer's 7-digit number">
            <input
              className={input("tnNumber")}
              value={form.tnNumber}
              onChange={(event) => onChange({ tnNumber: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              maxLength={15}
            />
          </Field>
          <Field label="Name" error={errors.tnName}>
            <input
              className={input("tnName")}
              value={form.tnName}
              onChange={(event) => onChange({ tnName: event.target.value })}
              maxLength={120}
            />
          </Field>
          <Field label="Phone" error={errors.tnPhone}>
            <input
              className={input("tnPhone")}
              value={form.tnPhone}
              onChange={(event) => onChange({ tnPhone: event.target.value })}
              inputMode="tel"
              maxLength={20}
            />
          </Field>
          <Field label="E-mail (optional)" error={errors.tnEmail}>
            <input
              className={input("tnEmail")}
              value={form.tnEmail}
              onChange={(event) => onChange({ tnEmail: event.target.value })}
              inputMode="email"
              autoCapitalize="none"
              maxLength={120}
            />
          </Field>
        </div>
      </FieldGroup>
    </FormSection>
  );
}

/** INCA city and street (picked or added) and optionally the node number. */
function LocationFields({
  ticketId,
  ctx,
  form,
  errors,
  onChange,
  withNumber = false,
}: {
  ticketId: string;
  ctx: ProvisioningContext;
  form: Form;
  errors: FormErrors;
  onChange: (patch: Partial<Form>) => void;
  withNumber?: boolean;
}) {
  const { token } = useSession();
  const [streets, setStreets] = React.useState<IncaOption[] | null>(null);
  const [streetsError, setStreetsError] = React.useState("");
  const cityId = form.tnAddCity ? null : form.tnCityId;
  const addStreet = form.tnAddCity || form.tnAddStreet;
  const input = (key: keyof Form) => cn("input", errors[key] && "border-error");
  const streetsLoading = Boolean(cityId) && !streets && !streetsError;

  React.useEffect(() => {
    setStreets(null);
    setStreetsError("");
    if (!cityId) {
      return;
    }
    let cancelled = false;
    apiGet(`/provisioning/tickets/${ticketId}/inca/streets?city_id=${encodeURIComponent(cityId)}`, token, {
      silent: true,
    })
      .then((list: IncaOption[]) => !cancelled && setStreets(list))
      .catch((err: any) => !cancelled && setStreetsError(err?.message || "Could not load streets"));
    return () => {
      cancelled = true;
    };
  }, [cityId, ticketId, token]);

  return (
    <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {form.tnAddCity ? (
            <Field label="New city" error={errors.tnNewCity}>
              <input
                className={input("tnNewCity")}
                value={form.tnNewCity}
                onChange={(event) => onChange({ tnNewCity: event.target.value })}
                maxLength={60}
                placeholder="City name"
              />
            </Field>
          ) : (
            <Field label="City" error={errors.tnCityId}>
              <SelectInput
                label="City"
                placeholder="Choose the city…"
                options={toOptions(ctx.options.cities)}
                value={form.tnCityId}
                error={!!errors.tnCityId}
                extra={{ value: NEW_OPTION, label: "+ Add new city" }}
                onChange={(value) =>
                  onChange(
                    value === NEW_OPTION
                      ? { tnAddCity: true, tnCityId: null, tnStreetId: null }
                      : { tnCityId: value, tnStreetId: null, tnAddStreet: false },
                  )
                }
              />
            </Field>
          )}
          {form.tnAddCity ? (
            <Field label="Area code" error={errors.tnAreaCode}>
              <input
                className={input("tnAreaCode")}
                value={form.tnAreaCode}
                onChange={(event) => onChange({ tnAreaCode: event.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                maxLength={10}
                placeholder="e.g. 20002"
              />
            </Field>
          ) : addStreet ? (
            <Field label="New street" error={errors.tnNewStreet}>
              <input
                className={input("tnNewStreet")}
                value={form.tnNewStreet}
                onChange={(event) => onChange({ tnNewStreet: event.target.value })}
                maxLength={80}
                placeholder="Street name"
              />
            </Field>
          ) : (
            <Field
              label="Street"
              error={errors.tnStreetId ?? (streetsError || undefined)}
              hint={streetsLoading ? "Loading streets…" : undefined}
            >
              <SelectInput
                label="Street"
                placeholder={cityId ? "Choose the street…" : "Choose the city first"}
                options={toOptions(streets ?? [])}
                value={form.tnStreetId}
                error={!!errors.tnStreetId}
                disabled={!cityId || streetsLoading}
                extra={cityId && !streetsLoading ? { value: NEW_OPTION, label: "+ Add new street" } : undefined}
                onChange={(value) =>
                  onChange(value === NEW_OPTION ? { tnAddStreet: true, tnStreetId: null } : { tnStreetId: value })
                }
              />
            </Field>
          )}
        </div>
        {form.tnAddCity ? (
          <Field label="New street" error={errors.tnNewStreet}>
            <input
              className={input("tnNewStreet")}
              value={form.tnNewStreet}
              onChange={(event) => onChange({ tnNewStreet: event.target.value })}
              maxLength={80}
              placeholder="Street name"
            />
          </Field>
        ) : null}
        {form.tnAddCity || form.tnAddStreet ? (
          <button
            type="button"
            onClick={() =>
              onChange(
                form.tnAddCity
                  ? { tnAddCity: false, tnNewCity: "", tnAreaCode: "", tnNewStreet: "", tnAddStreet: false }
                  : { tnAddStreet: false, tnNewStreet: "" },
              )
            }
            className="-mt-1 self-start text-xs font-semibold text-primary"
          >
            {form.tnAddCity ? "Choose an existing city instead" : "Choose an existing street instead"}
          </button>
        ) : null}
        {withNumber ? (
          <Field label="Number" error={errors.tnNumber} hint="House / plot number of the Terminal Node">
            <input
              className={input("tnNumber")}
              value={form.tnNumber}
              onChange={(event) => onChange({ tnNumber: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              maxLength={15}
            />
          </Field>
        ) : null}
    </>
  );
}

function toOptions(options: IncaOption[]) {
  return options.map((option) => ({ value: option.code, label: option.label }));
}

/** Numbered card that groups one stage of the form. */
function FormSection({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-borderlight bg-white p-4">
      <header className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-bg text-[13px] font-bold text-primary">
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-7 text-ink">{title}</h3>
          {subtitle ? <p className="text-xs leading-4 text-gray2">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-borderlight pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray2">{title}</p>
      {children}
    </div>
  );
}

function DetectionCard({
  title,
  detection,
  confirmed,
  detecting,
  error,
  note,
  confirm,
  onDetect,
  onConfirm,
}: {
  title: string;
  detection: OntDetection | null;
  confirmed: boolean;
  detecting: boolean;
  error?: string;
  /** What the run will do with the ONT, from this detection. */
  note?: string | null;
  /** The technician must confirm the detected OLT / PON. */
  confirm: boolean;
  onDetect: () => void;
  onConfirm: (value: boolean) => void;
}) {
  const tone =
    detection?.status === "NOT_DETECTED" || detection?.status === "OLT_REGISTERED"
      ? { className: "text-error", icon: XCircle }
      : detection?.status === "REGISTERED"
        ? { className: "text-info", icon: Info }
        : { className: "text-success", icon: CheckCircle2 };
  const oltList =
    detection?.olt_state === "REGISTERED"
      ? `Registered${detection.online == null ? "" : detection.online ? " · online" : " · offline"}`
      : detection?.olt_state === "UNREGISTERED"
        ? "Unregistered"
        : null;
  const ToneIcon = tone.icon;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-borderlight bg-surface p-3",
        error && "border-error",
      )}
    >
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
          <Fact label="OLT" value={detection.olt_name ?? detection.olt_id} />
          <Fact label="PON" value={detection.pon} />
          <Fact label="OLT list" value={oltList} />
          {detection.operator ? <Fact label="Firmware" value={detection.operator} /> : null}
          <Fact label="Terminal node" value={detection.terminal_node_id} />
          {note ? <InlineBanner tone="info" message={note} /> : null}
          {confirm ? (
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
        <p className="text-xs text-gray2">
          Checks INCA Active Devices (registered and unregistered) for where the ONT is connected.
        </p>
      )}
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
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
              {(run.action === "NEW_CONNECTION" || run.action === "ONT_REPLACEMENT") &&
              run.submitted?.pppoe_password_provided ? (
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
              <SwitchRow
                title="Service working"
                hint="Confirm the customer's internet works after the fix."
                checked={serviceConfirmed}
                onChange={setServiceConfirmed}
              />
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
      {reading?.details?.length ? (
        <>
          {reading.details.map((line) => (
            <Fact key={line.label} label={line.label} value={line.value} />
          ))}
          <Fact label="Read at" value={moment(reading.read_at).format("HH:mm:ss")} />
        </>
      ) : reading ? (
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
