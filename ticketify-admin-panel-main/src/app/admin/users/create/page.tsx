"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Info, Loader2, UserPlus } from "lucide-react";
import { AdminAPI } from "@/lib/admin-api";
import {
  AccessLevel,
  CreateUserData,
  Role,
  ScreenDef,
  UserSource,
} from "@/types/admin";
import { isFullAccess, type Screen } from "@/lib/permissions";
import {
  ScreenAccessEditor,
  toLevelMap,
  toOverrides,
  type LevelMap,
} from "@/components/admin/screen-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";
import { passwordPolicyError } from "@/lib/password-policy";

type Errors = Partial<Record<Exclude<keyof CreateUserData, "permissions">, string>>;

const EMPTY: CreateUserData = {
  source: "MEDIANET",
  crm_user_id: "",
  ooredoo_user_id: "",
  email: "",
  name: "",
  phone: "",
  password: "",
  role_id: "",
};

function validate(data: CreateUserData): Errors {
  const errors: Errors = {};
  if (!data.name.trim()) errors.name = "Enter the person's full name.";
  if (!data.email.trim()) {
    errors.email = "Enter a work email.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    errors.email = "That doesn't look like a valid email.";
  }
  if (!data.phone.trim()) {
    errors.phone = "Enter a phone number for SMS and contact.";
  } else if (!/^\+?[0-9 ]{6,20}$/.test(data.phone.trim())) {
    errors.phone = "Use digits only, e.g. +960 7722229.";
  }
  if (data.source === "OOREDOO") {
    const id = data.ooredoo_user_id?.trim() ?? "";
    if (!id) {
      errors.ooredoo_user_id = "Choose the FMS user from the list.";
    } else if (!/^[0-9]{1,12}$/.test(id)) {
      errors.ooredoo_user_id = "Ooredoo ids are numbers only, e.g. 212.";
    }
  } else {
    const id = data.crm_user_id?.trim() ?? "";
    if (!id) {
      errors.crm_user_id = "Choose the CRM user from the list.";
    } else if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      errors.crm_user_id = "CRM IDs contain only letters, numbers and dashes.";
    }
  }
  if (!data.role_id) errors.role_id = "Choose a role.";
  if (!data.password) {
    errors.password = "Set a temporary password.";
  } else {
    const policyError = passwordPolicyError(data.password);
    if (policyError) errors.password = policyError;
  }
  return errors;
}

type DirectoryOption = { id: string; label: string; email?: string | null };

export default function CreateUserPage() {
  const router = useRouter();
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [form, setForm] = React.useState<CreateUserData>(EMPTY);
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [screens, setScreens] = React.useState<ScreenDef[]>([]);
  const [levels, setLevels] = React.useState<LevelMap>({});
  const [crmTeams, setCrmTeams] = React.useState<DirectoryOption[]>([]);
  const [crmTeamId, setCrmTeamId] = React.useState("");
  const [crmUsers, setCrmUsers] = React.useState<DirectoryOption[]>([]);
  const [crmUsersLoading, setCrmUsersLoading] = React.useState(false);
  const [fmsUsers, setFmsUsers] = React.useState<DirectoryOption[]>([]);
  const [fmsUsersLoading, setFmsUsersLoading] = React.useState(false);
  const [directoryError, setDirectoryError] = React.useState("");

  React.useEffect(() => {
    Promise.all([AdminAPI.getAllRoles(), AdminAPI.getScreens()])
      .then(([list, catalogue]) => {
        // Only full-access admins can hand out full access.
        setRoles(isFullAccess() ? list : list.filter((role) => !role.full_access));
        setScreens(catalogue.screens);
      })
      .catch(() => toast.error("Couldn't load roles. Refresh to try again."));
  }, []);

  React.useEffect(() => {
    if (form.source !== "MEDIANET") return;
    let cancelled = false;
    setDirectoryError("");
    AdminAPI.getCrmTeams()
      .then((data) => {
        if (!cancelled) setCrmTeams(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setCrmTeams([]);
          setDirectoryError(
            err?.response?.data?.message || "Couldn't load CRM teams.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form.source]);

  React.useEffect(() => {
    if (form.source !== "MEDIANET" || !crmTeamId) {
      setCrmUsers([]);
      return;
    }
    let cancelled = false;
    setCrmUsersLoading(true);
    setDirectoryError("");
    AdminAPI.getCrmUsers(crmTeamId)
      .then((data) => {
        if (!cancelled) setCrmUsers(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setCrmUsers([]);
          setDirectoryError(
            err?.response?.data?.message || "Couldn't load CRM users for that team.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCrmUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.source, crmTeamId]);

  React.useEffect(() => {
    if (form.source !== "OOREDOO") return;
    let cancelled = false;
    setFmsUsersLoading(true);
    setDirectoryError("");
    AdminAPI.getFmsUsers()
      .then((data) => {
        if (!cancelled) setFmsUsers(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setFmsUsers([]);
          setDirectoryError(
            err?.response?.data?.message || "Couldn't load FMS users.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setFmsUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.source]);

  function update(field: keyof Errors, value: string) {
    setForm((prev) => {
      if (field === "source") {
        setCrmTeamId("");
        setCrmUsers([]);
        setFmsUsers([]);
        setDirectoryError("");
        return {
          ...prev,
          source: value as UserSource,
          crm_user_id: "",
          ooredoo_user_id: "",
        };
      }
      return { ...prev, [field]: value };
    });
    if (field === "role_id") {
      setLevels(toLevelMap(roles.find((role) => role.id === value)?.permissions));
    }
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function selectCrmUser(userId: string) {
    const picked = crmUsers.find((u) => u.id === userId);
    setForm((prev) => ({
      ...prev,
      crm_user_id: userId,
      name: prev.name.trim() ? prev.name : picked?.label || prev.name,
      email:
        prev.email.trim() || !picked?.email ? prev.email : String(picked.email),
    }));
    if (errors.crm_user_id) {
      setErrors((prev) => ({ ...prev, crm_user_id: undefined }));
    }
  }

  function selectFmsUser(userId: string) {
    const picked = fmsUsers.find((u) => u.id === userId);
    setForm((prev) => ({
      ...prev,
      ooredoo_user_id: userId,
      email:
        prev.email.trim() || !picked?.email ? prev.email : String(picked.email),
    }));
    if (errors.ooredoo_user_id) {
      setErrors((prev) => ({ ...prev, ooredoo_user_id: undefined }));
    }
  }

  function setLevel(screen: Screen, level: AccessLevel) {
    setLevels((prev) => ({ ...prev, [screen]: level }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setSaving(true);
    try {
      const result = await AdminAPI.createUser({
        source: form.source,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        role_id: form.role_id,
        ...(form.source === "OOREDOO"
          ? { ooredoo_user_id: form.ooredoo_user_id?.trim() }
          : { crm_user_id: form.crm_user_id?.trim() }),
        permissions: toOverrides(levels, toLevelMap(selectedRole?.permissions)),
      });
      if (!result?.user) {
        toast.error("The user wasn't created. Check the details and try again.");
        return;
      }
      toast.success(`${result.user.name} can now sign in`);
      router.push("/admin/users");
    } catch (error: any) {
      const message = error.response?.data?.message;
      if (error.response?.status === 409) {
        toast.error("An account with this email already exists.");
      } else {
        toast.error(
          Array.isArray(message) ? message.join(", ") : message || "Couldn't create the user.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedRole = roles.find((role) => role.id === form.role_id);

  return (
    <>
      <PageHeader
        backHref="/admin/users"
        backLabel="Users"
        title="Add user"
        description="Create an mPro account. The person signs in with this email and the temporary password you set."
      />

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field id="name" label="Full name" error={errors.name}>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Mohamed Saifullah"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.name)}
                />
              </Field>
              <Field id="email" label="Work email" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="name@medianet.mv"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.email)}
                />
              </Field>
              <Field id="phone" label="Phone number" error={errors.phone}>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+960 7722229"
                  aria-invalid={Boolean(errors.phone)}
                />
              </Field>
              <Field
                id="source"
                label="Ticket platform"
                error={errors.source}
                hint="Medianet techs get CRM tickets; Ooredoo techs get FMS tickets."
              >
                <Select
                  value={form.source}
                  onValueChange={(value) => update("source", value)}
                >
                  <SelectTrigger id="source" aria-invalid={Boolean(errors.source)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEDIANET">Medianet (CRM)</SelectItem>
                    <SelectItem value="OOREDOO">Ooredoo (FMS)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.source === "OOREDOO" ? (
                <Field
                  id="ooredoo_user_id"
                  label="FMS user"
                  error={errors.ooredoo_user_id || directoryError || undefined}
                  hint={
                    fmsUsersLoading
                      ? "Loading Assign-to-User list from FMS…"
                      : "Same list as FMS → Assign to User."
                  }
                >
                  <Select
                    value={form.ooredoo_user_id || undefined}
                    onValueChange={selectFmsUser}
                    disabled={fmsUsersLoading || fmsUsers.length === 0}
                  >
                    <SelectTrigger
                      id="ooredoo_user_id"
                      aria-invalid={Boolean(errors.ooredoo_user_id)}
                    >
                      <SelectValue
                        placeholder={
                          fmsUsersLoading ? "Loading…" : "Choose FMS user"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {fmsUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {`${user.label} (${user.id})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <>
                  <Field
                    id="crm_team_id"
                    label="CRM team"
                    hint="Pick the team, then the person."
                  >
                    <Select
                      value={crmTeamId || undefined}
                      onValueChange={(value) => {
                        setCrmTeamId(value);
                        update("crm_user_id", "");
                      }}
                      disabled={crmTeams.length === 0}
                    >
                      <SelectTrigger id="crm_team_id">
                        <SelectValue placeholder="Choose a CRM team" />
                      </SelectTrigger>
                      <SelectContent>
                        {crmTeams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    id="crm_user_id"
                    label="CRM user"
                    error={errors.crm_user_id || directoryError || undefined}
                    hint={
                      crmUsersLoading
                        ? "Loading team members…"
                        : "Must match CRM so tickets sync correctly."
                    }
                  >
                    <Select
                      value={form.crm_user_id || undefined}
                      onValueChange={selectCrmUser}
                      disabled={!crmTeamId || crmUsersLoading || crmUsers.length === 0}
                    >
                      <SelectTrigger
                        id="crm_user_id"
                        aria-invalid={Boolean(errors.crm_user_id)}
                      >
                        <SelectValue
                          placeholder={
                            !crmTeamId
                              ? "Choose a team first"
                              : crmUsersLoading
                                ? "Loading…"
                                : "Choose CRM user"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {crmUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field
                id="role_id"
                label="Role"
                error={errors.role_id}
                hint={selectedRole?.description ?? undefined}
              >
                <Select
                  value={form.role_id}
                  onValueChange={(value) => update("role_id", value)}
                >
                  <SelectTrigger
                    id="role_id"
                    aria-invalid={Boolean(errors.role_id)}
                    className={cn(errors.role_id && "border-destructive")}
                  >
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                id="password"
                label="Temporary password"
                error={errors.password}
                hint="At least 6 characters. Share it securely."
              >
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                    aria-invalid={Boolean(errors.password)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            </CardContent>
          </Card>

          {selectedRole && (
            <Card>
              <CardHeader>
                <CardTitle>Screen access</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedRole.full_access
                    ? `${selectedRole.name} has full access to every screen.`
                    : `Starts from the ${selectedRole.name} role. Raise or lower a screen for this person only.`}
                </p>
              </CardHeader>
              {!selectedRole.full_access && (
                <CardContent>
                  <ScreenAccessEditor
                    screens={screens}
                    levels={levels}
                    baseline={toLevelMap(selectedRole.permissions)}
                    onChange={setLevel}
                  />
                </CardContent>
              )}
            </Card>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/admin/users")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {saving ? "Creating…" : "Create user"}
            </Button>
          </div>
        </div>

        <aside className="space-y-6">
          <Card className="bg-accent/40">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-accent-foreground">
                <Info className="h-4 w-4" />
                Before you start
              </div>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Pick the person from CRM or FMS — don&apos;t type staff IDs by hand.
                </li>
                <li>Each email can only be used once.</li>
                <li>Everyone signs in at the same address. People with only the Technician app land in /field; everyone else lands on their first console screen.</li>
              </ul>
            </CardContent>
          </Card>

          {roles.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Roles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-0">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => update("role_id", role.id)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60",
                      form.role_id === role.id && "bg-accent text-accent-foreground hover:bg-accent",
                    )}
                  >
                    <p className="text-sm font-medium">{role.name}</p>
                    {role.description && (
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </form>
    </>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
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
