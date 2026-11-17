"use client";

import React from "react";
import FormModal from "@/components/field/ui/form-modal";
import { apiGet, apiPatch } from "@/lib/field/api";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { useTickets } from "@/lib/field/tickets";

type Option = { id: string; label: string };

type AddressForm = {
  can_edit: boolean;
  firstname: string;
  lastname: string;
  middlename: string;
  mobile: string;
  email: string;
  address1: string;
  address2: string;
  street: string;
  company: string;
  zip: string;
  country_id: string;
  atoll_id: string;
  island_id: string;
  atolls: Option[];
  countries: Option[];
};

/** Relocation-only: update installation address; name/mobile stay locked from FMS. */
export default function FmsAddressModal({
  ticketId,
  visible,
  onClose,
  onSuccess,
}: {
  ticketId: string;
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { token } = useSession();
  const { notifyTicketMutation } = useTickets();
  const [loading, setLoading] = React.useState(false);
  const [booting, setBooting] = React.useState(false);
  const [form, setForm] = React.useState<AddressForm | null>(null);
  const [islands, setIslands] = React.useState<Option[]>([]);
  const [address1, setAddress1] = React.useState("");
  const [address2, setAddress2] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [zip, setZip] = React.useState("");
  const [countryId, setCountryId] = React.useState("");
  const [atollId, setAtollId] = React.useState("");
  const [islandId, setIslandId] = React.useState("");

  React.useEffect(() => {
    if (!visible || !token) return;
    let cancelled = false;
    setBooting(true);
    setForm(null);
    setIslands([]);
    apiGet(`/tickets/${ticketId}/fms/address`, token, { timeoutMs: 60_000 })
      .then((data: AddressForm) => {
        if (cancelled) return;
        if (!data?.can_edit) {
          showError("Address can only be updated on Relocation tickets");
          onClose();
          return;
        }
        setForm(data);
        setAddress1(data.address1 || "");
        setAddress2(data.address2 || "");
        setStreet(data.street || "");
        setCompany(data.company || "");
        setZip(data.zip || "");
        setCountryId(data.country_id || "");
        setAtollId(data.atoll_id || "");
        setIslandId(data.island_id || "");
      })
      .catch((err: any) => {
        if (!cancelled) {
          showError(err?.message || "Could not load address form");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, ticketId, onClose]);

  React.useEffect(() => {
    if (!visible || !token || !atollId || !form) return;
    let cancelled = false;
    apiGet(
      `/tickets/${ticketId}/fms/islands?atoll_id=${encodeURIComponent(atollId)}`,
      token,
      { silent: true, timeoutMs: 45_000 },
    )
      .then((data) => {
        if (cancelled) return;
        setIslands(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) {
          setIslands([]);
          showError("Could not load islands");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, ticketId, atollId, form]);

  async function submit() {
    if (!token) return;
    if (!address1.trim() || !street.trim()) {
      showError("Address 1 and street are required");
      return;
    }
    if (!countryId || !atollId || !islandId) {
      showError("Choose country, atoll, and island");
      return;
    }
    setLoading(true);
    try {
      const updated = await apiPatch(
        `/tickets/${ticketId}/fms/address`,
        {
          address1: address1.trim(),
          address2: address2.trim(),
          street: street.trim(),
          company: company.trim(),
          zip: zip.trim(),
          country_id: countryId,
          atoll_id: atollId,
          island_id: islandId,
        },
        token,
        { timeoutMs: 60_000 },
      );
      if (updated) {
        await notifyTicketMutation(ticketId, {}, updated);
      }
      showSuccess("Customer address updated in FMS");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      showError(err?.message || "Could not update address");
    } finally {
      setLoading(false);
    }
  }

  const customerName = [form?.firstname, form?.middlename, form?.lastname]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <FormModal
      visible={visible}
      onClose={() => {
        if (!loading) onClose();
      }}
      title="Change address"
      subtitle="Relocation only — name and mobile stay as in FMS."
      loading={loading || booting}
      footer={
        booting
          ? undefined
          : { onSubmit: submit, submitText: "Update address", submitDisabled: loading }
      }
    >
      {booting || !form ? (
        <p className="text-sm text-gray2">Loading address from FMS…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <LockedRow label="Name" value={customerName || "—"} />
          <LockedRow label="Mobile" value={form.mobile || "—"} />
          {form.email ? <LockedRow label="Email" value={form.email} /> : null}
          <TextField label="Address 1" value={address1} onChange={setAddress1} disabled={loading} required />
          <TextField label="Address 2" value={address2} onChange={setAddress2} disabled={loading} />
          <TextField label="Street" value={street} onChange={setStreet} disabled={loading} required />
          <TextField label="Company" value={company} onChange={setCompany} disabled={loading} />
          <TextField label="ZIP" value={zip} onChange={setZip} disabled={loading} />
          <SelectField
            label="Country"
            value={countryId}
            onChange={setCountryId}
            options={form.countries}
          />
          <SelectField
            label="Atoll"
            value={atollId}
            onChange={(value) => {
              setAtollId(value);
              setIslandId("");
            }}
            options={form.atolls}
          />
          <SelectField
            label="Island"
            value={islandId}
            onChange={setIslandId}
            options={islands}
            disabled={!atollId}
            emptyText={atollId ? "No islands" : "Choose an atoll first"}
          />
        </div>
      )}
    </FormModal>
  );
}

function LockedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface px-3 py-2">
      <span className="caption">{label}</span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = `fms-addr-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1">
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  emptyText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="field-label">{label}</label>
      <select
        className="input"
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {options.length ? "Please select" : emptyText || "No options"}
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
