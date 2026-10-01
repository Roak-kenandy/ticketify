"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Info, Loader2, UserPlus } from "lucide-react";
import { AdminAPI } from "@/lib/admin-api";
import { CreateUserData, Role } from "@/types/admin";
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

type Errors = Partial<Record<keyof CreateUserData, string>>;

const EMPTY: CreateUserData = {
  crm_user_id: "",
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
  } else if (!/^[\d\s\-+()]{7,}$/.test(data.phone.trim())) {
    errors.phone = "Use digits only, e.g. +960 7722229.";
  }
  if (!data.crm_user_id.trim()) {
    errors.crm_user_id = "Paste the user's ID from CRM.";
  }
  if (!data.role_id) errors.role_id = "Choose a role.";
  if (!data.password) {
    errors.password = "Set a temporary password.";
  } else if (data.password.length < 6) {
    errors.password = "Use at least 6 characters.";
  }
  return errors;
}

export default function CreateUserPage() {
  const router = useRouter();
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [form, setForm] = React.useState<CreateUserData>(EMPTY);
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    AdminAPI.getAllRoles()
      .then(setRoles)
      .catch(() => toast.error("Couldn't load roles. Refresh to try again."));
  }, []);

  function update(field: keyof CreateUserData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
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
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        crm_user_id: form.crm_user_id.trim(),
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
        description="Create a Ticketify account. The person signs in with this email and the temporary password you set."
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
                id="crm_user_id"
                label="CRM user ID"
                error={errors.crm_user_id}
                hint="Must match the user's ID in CRM so tickets sync correctly."
              >
                <Input
                  id="crm_user_id"
                  value={form.crm_user_id}
                  onChange={(e) => update("crm_user_id", e.target.value)}
                  placeholder="743f1b25-6132-4f5d-9457-1b0fb1c763a3"
                  className="font-mono text-xs"
                  aria-invalid={Boolean(errors.crm_user_id)}
                />
              </Field>
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
                hint={selectedRole?.description}
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
                <li>The CRM user ID must match exactly, or assigned tickets won&apos;t appear in the app.</li>
                <li>Each email can only be used once.</li>
                <li>Technicians sign in on the mobile app; other roles use this console.</li>
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
