"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { AdminAPI } from "@/lib/admin-api";
import type { Screen } from "@/lib/permissions";
import type { AccessLevel, Role, RoleInput, ScreenDef } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import {
  ScreenAccessEditor,
  toEntries,
  toLevelMap,
  type LevelMap,
} from "@/components/admin/screen-access";
import { cn } from "@/lib/utils";

type Draft = Omit<RoleInput, "permissions" | "description"> & {
  description: string;
  levels: LevelMap;
};

const EMPTY: Draft = {
  name: "",
  description: "",
  full_access: false,
  field_technician: false,
  stock_holder: false,
  store: false,
  levels: {},
};

const CAPABILITIES: { key: keyof Pick<Draft, "full_access" | "field_technician" | "stock_holder" | "store">; label: string; hint: string }[] = [
  {
    key: "full_access",
    label: "Full access",
    hint: "Every screen at every level, plus managing roles and users.",
  },
  {
    key: "field_technician",
    label: "Field technician",
    hint: "In the auto-assign pool, sees only their own tickets and holds personal stock.",
  },
  {
    key: "stock_holder",
    label: "Stock holder",
    hint: "Receives stock from the store and hands it out to technicians.",
  },
  {
    key: "store",
    label: "Store",
    hint: "Issues stock to stock holders and records returns.",
  },
];

function toDraft(role: Role): Draft {
  return {
    name: role.name,
    description: role.description ?? "",
    full_access: role.full_access,
    field_technician: role.field_technician,
    stock_holder: role.stock_holder,
    store: role.store,
    levels: toLevelMap(role.permissions),
  };
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(", ") : typeof message === "string" ? message : fallback;
}

export default function RolesPage() {
  const [roles, setRoles] = React.useState<Role[] | null>(null);
  const [screens, setScreens] = React.useState<ScreenDef[]>([]);
  const [selected, setSelected] = React.useState<string | "new" | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const load = React.useCallback(async (select?: string) => {
    try {
      const [list, catalogue] = await Promise.all([AdminAPI.getAllRoles(), AdminAPI.getScreens()]);
      setRoles(list);
      setScreens(catalogue.screens);
      const next = list.find((role) => role.id === select) ?? list[0];
      if (next) {
        setSelected(next.id);
        setDraft(toDraft(next));
      }
    } catch {
      setRoles([]);
      toast.error("Couldn't load roles. Refresh to try again.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const role = roles?.find((item) => item.id === selected) ?? null;
  const locked = Boolean(role?.is_system);
  const original = role ? toDraft(role) : EMPTY;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  function pick(next: Role | "new") {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    if (next === "new") {
      setSelected("new");
      setDraft(EMPTY);
    } else {
      setSelected(next.id);
      setDraft(toDraft(next));
    }
  }

  function setLevel(screen: Screen, level: AccessLevel) {
    setDraft((prev) => ({ ...prev, levels: { ...prev.levels, [screen]: level } }));
  }

  async function save() {
    if (!draft.name.trim()) {
      toast.error("Give the role a name.");
      document.getElementById("role-name")?.focus();
      return;
    }
    setSaving(true);
    try {
      const body: RoleInput = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        full_access: draft.full_access,
        field_technician: draft.field_technician,
        stock_holder: draft.stock_holder,
        store: draft.store,
        permissions: toEntries(draft.levels),
      };
      const saved = locked
        ? await AdminAPI.updateRole(role!.id, { description: body.description })
        : selected === "new"
          ? await AdminAPI.createRole(body)
          : await AdminAPI.updateRole(role!.id, body);
      toast.success(selected === "new" ? `${saved.name} created` : `${saved.name} saved`);
      await load(saved.id);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the role."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!role) return;
    try {
      await AdminAPI.deleteRole(role.id);
      toast.success(`${role.name} deleted`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't delete the role."));
    }
  }

  const screenCount = toEntries(draft.levels).length;

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Choose which screens each role can open and whether they can view, edit or delete. Per-user changes are made on the user's page."
        actions={
          <Button onClick={() => pick("new")} disabled={selected === "new"}>
            <Plus className="h-4 w-4" />
            New role
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardContent className="space-y-1 p-2">
            {roles === null
              ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)
              : roles.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pick(item)}
                    aria-current={selected === item.id ? "true" : undefined}
                    className={cn(
                      "w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      selected === item.id && "bg-accent text-accent-foreground hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {item.name}
                      {item.is_system && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Built-in" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {item.full_access
                          ? "All screens"
                          : `${item.permissions.length} screen${item.permissions.length === 1 ? "" : "s"}`}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {item.user_count}
                      </span>
                    </span>
                  </button>
                ))}
            {selected === "new" && (
              <div className="rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground">
                {draft.name.trim() || "New role"}
              </div>
            )}
          </CardContent>
        </Card>

        {roles === null ? (
          <Skeleton className="h-[480px] rounded-xl" />
        ) : selected ? (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {selected === "new" ? "New role" : role?.name}
                </CardTitle>
                {role && (
                  <div className="flex gap-2">
                    {role.is_system && <Badge variant="outline">Built-in</Badge>}
                    <Badge variant="outline">
                      {role.user_count} user{role.user_count === 1 ? "" : "s"}
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-5">
                {locked && (
                  <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                    Built-in roles always have full access so someone can manage roles and users. Only the description can be changed.
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="role-name">Name</Label>
                    <Input
                      id="role-name"
                      value={draft.name}
                      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Finance"
                      maxLength={60}
                      disabled={locked}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role-description">Description</Label>
                    <Input
                      id="role-description"
                      value={draft.description}
                      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="What this role is for"
                      maxLength={255}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {CAPABILITIES.map((capability) => (
                    <label
                      key={capability.key}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-lg border p-3",
                        locked ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{capability.label}</span>
                        <span className="block text-xs text-muted-foreground">{capability.hint}</span>
                      </span>
                      <Switch
                        checked={draft[capability.key]}
                        disabled={locked}
                        aria-label={capability.label}
                        onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, [capability.key]: checked }))}
                      />
                    </label>
                  ))}
                </div>
                {draft.field_technician && !draft.full_access && !draft.levels.technician_app && (
                  <p className="text-xs font-medium text-warning">
                    Field technicians also need the Technician app screen to work tickets.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Screens</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {draft.full_access ? "All screens" : `${screenCount} of ${screens.length} screens`}
                </span>
              </CardHeader>
              <CardContent>
                {draft.full_access ? (
                  <p className="text-sm text-muted-foreground">
                    Full access opens every screen at its highest level.
                  </p>
                ) : (
                  <ScreenAccessEditor
                    screens={screens}
                    levels={draft.levels}
                    onChange={setLevel}
                    disabled={locked}
                  />
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div>
                {role && !role.is_system && (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete role
                  </Button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {dirty && (
                  <Button
                    variant="outline"
                    onClick={() => (role ? setDraft(toDraft(role)) : setDraft(EMPTY))}
                    disabled={saving}
                  >
                    Discard changes
                  </Button>
                )}
                <Button onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {selected === "new" ? "Create role" : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${role?.name ?? "role"}?`}
        description={
          role?.user_count
            ? `${role.user_count} user${role.user_count === 1 ? " is" : "s are"} on this role. Move them to another role first.`
            : "The role is removed. This can't be undone."
        }
        confirmLabel="Delete role"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
