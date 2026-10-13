"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, Loader2, PackagePlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import axiosInterceptorInstance, { apiErrorMessage } from "@/lib/axios-interceptor";
import type { InventoryItem } from "@/lib/inventory";

export const ITEMS_HREF = "/inventory/items";

export function uniqueCategories(items: InventoryItem[]) {
  return Array.from(new Set(items.map((item) => item.category))).sort((a, b) => a.localeCompare(b));
}

type Form = {
  code: string;
  name: string;
  category: string;
  stock_uom: string;
  consumption_uom: string;
  conversion_factor: string;
  serialized: boolean;
  allow_decimal: boolean;
  remarks_required: boolean;
  active: boolean;
  notes: string;
};

type Errors = Partial<Record<keyof Form, string>>;

function validate(form: Form, creating: boolean): Errors {
  const errors: Errors = {};
  if (creating && !/^[A-Z0-9_]{2,40}$/.test(form.code)) errors.code = "2–40 characters: A–Z, 0–9 or _";
  if (form.name.trim().length < 2) errors.name = "Enter the item name.";
  if (form.category.trim().length < 2) errors.category = "Enter a category.";
  if (!form.stock_uom.trim()) errors.stock_uom = "Enter the stock unit.";
  if (!form.consumption_uom.trim()) errors.consumption_uom = "Enter the consumption unit.";
  if (!(Number(form.conversion_factor) > 0)) errors.conversion_factor = "Must be greater than zero.";
  return errors;
}

export function ItemForm({ item, categories }: { item: InventoryItem | null; categories: string[] }) {
  const router = useRouter();
  const creating = item === null;
  const [form, setForm] = React.useState<Form>({
    code: item?.code ?? "",
    name: item?.name ?? "",
    category: item?.category ?? "",
    stock_uom: item?.stock_uom ?? "Unit",
    consumption_uom: item?.consumption_uom ?? "Unit",
    conversion_factor: String(item?.conversion_factor ?? 1),
    serialized: item?.serialized ?? false,
    allow_decimal: item?.allow_decimal ?? false,
    remarks_required: item?.remarks_required ?? false,
    active: item?.active ?? true,
    notes: item?.notes ?? "",
  });
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  const factor = Number(form.conversion_factor);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validate(form, creating);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(`item-${firstInvalid}`)?.focus();
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      category: form.category.trim(),
      stock_uom: form.stock_uom.trim(),
      consumption_uom: form.consumption_uom.trim(),
      conversion_factor: factor,
      serialized: form.serialized,
      allow_decimal: form.serialized ? false : form.allow_decimal,
      remarks_required: form.remarks_required,
      active: form.active,
      notes: form.notes.trim(),
    };
    try {
      if (creating) {
        await axiosInterceptorInstance.post("/inventory/items", { ...body, code: form.code });
        toast.success(`${body.name} added`);
      } else {
        await axiosInterceptorInstance.patch(`/inventory/items/${item.id}`, body);
        toast.success(`${body.name} updated`);
      }
      router.push(ITEMS_HREF);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save the item."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Item details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field
              id="item-code"
              label="Code"
              error={errors.code}
              hint={creating ? "Unique, can't be changed later." : "Codes can't be changed."}
            >
              <Input
                id="item-code"
                value={form.code}
                onChange={(e) => update("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                placeholder="CABLE_2CORE"
                className="font-mono"
                disabled={!creating}
                aria-invalid={Boolean(errors.code)}
              />
            </Field>
            <Field id="item-category" label="Category" error={errors.category}>
              <Input
                id="item-category"
                list="item-categories"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                placeholder="Cable / wire"
                aria-invalid={Boolean(errors.category)}
              />
              <datalist id="item-categories">
                {categories.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field id="item-name" label="Name" error={errors.name} className="sm:col-span-2">
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="2-core drop cable"
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
            <Field id="item-notes" label="Notes" className="sm:col-span-2">
              <Input
                id="item-notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                maxLength={300}
                placeholder="Optional"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Units</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Field id="item-stock_uom" label="Stock UOM" error={errors.stock_uom} hint="How the store holds it.">
              <Input
                id="item-stock_uom"
                value={form.stock_uom}
                onChange={(e) => update("stock_uom", e.target.value)}
                placeholder="Roll"
                aria-invalid={Boolean(errors.stock_uom)}
              />
            </Field>
            <Field
              id="item-consumption_uom"
              label="Consumption UOM"
              error={errors.consumption_uom}
              hint="What technicians record."
            >
              <Input
                id="item-consumption_uom"
                value={form.consumption_uom}
                onChange={(e) => update("consumption_uom", e.target.value)}
                placeholder="Metre"
                aria-invalid={Boolean(errors.consumption_uom)}
              />
            </Field>
            <Field
              id="item-conversion_factor"
              label="Conversion factor"
              error={errors.conversion_factor}
              hint={
                factor > 0
                  ? `1 ${form.stock_uom || "stock unit"} = ${factor.toLocaleString("en-US")} ${form.consumption_uom || "units"}`
                  : undefined
              }
            >
              <Input
                id="item-conversion_factor"
                type="number"
                step="0.0001"
                min="0.0001"
                value={form.conversion_factor}
                onChange={(e) => update("conversion_factor", e.target.value)}
                aria-invalid={Boolean(errors.conversion_factor)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              <Toggle
                label="Serial number required"
                description="Each line is one unit with a unique serial (ONTs)."
                checked={form.serialized}
                onChange={(value) => update("serialized", value)}
              />
              <Toggle
                label="Decimal quantities"
                description="Allow up to 2 decimals, e.g. 12.5 m of cable."
                checked={form.serialized ? false : form.allow_decimal}
                disabled={form.serialized}
                onChange={(value) => update("allow_decimal", value)}
              />
              <Toggle
                label="Remarks required"
                description="Technician must add a note on every line."
                checked={form.remarks_required}
                onChange={(value) => update("remarks_required", value)}
              />
              <Toggle
                label="Active"
                description="Inactive items are hidden from technicians but stay on past reports."
                checked={form.active}
                onChange={(value) => update("active", value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.push(ITEMS_HREF)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : creating ? (
              <PackagePlus className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving…" : creating ? "Add item" : "Save changes"}
          </Button>
        </div>
      </div>

      <aside className="space-y-6">
        <Card className="bg-accent/40">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-accent-foreground">
              <Info className="h-4 w-4" />
              Good to know
            </div>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Changes apply to new lines only. Posted lines keep the name and unit they were recorded with.</li>
              <li>Serial items are always recorded one unit per line, so decimals are turned off.</li>
              <li>Use the conversion factor when the store and technicians count differently, e.g. 1 Roll = 305 Metre.</li>
              <li>Deactivate instead of deleting so past reports stay complete.</li>
            </ul>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 px-6 py-4 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
