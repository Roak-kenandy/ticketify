"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { StackHeader } from "@/components/field/shell/headers";
import { PrimaryButton } from "@/components/field/ui/button";
import { apiPost } from "@/lib/field/api";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";

type FieldName = "currentPassword" | "newPassword" | "confirmPassword";

const FIELDS: { name: FieldName; label: string; autoComplete: string }[] = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm new password", autoComplete: "new-password" },
];

function validate(values: Record<FieldName, string>): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (!values.currentPassword) {
    errors.currentPassword = "Enter your current password";
  }
  const next = values.newPassword;
  if (!next) {
    errors.newPassword = "Enter a new password";
  } else if (next.length < 8) {
    errors.newPassword = "Use at least 8 characters";
  } else if (next.length > 128) {
    errors.newPassword = "Use at most 128 characters";
  } else if (!/[A-Za-z]/.test(next)) {
    errors.newPassword = "Include at least one letter";
  } else if (!/\d/.test(next)) {
    errors.newPassword = "Include at least one number";
  } else if (next === values.currentPassword) {
    errors.newPassword = "New password must be different";
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = "Confirm your new password";
  } else if (values.confirmPassword !== next) {
    errors.confirmPassword = "Passwords do not match";
  }
  return errors;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { token, setToken } = useSession();
  const [values, setValues] = React.useState<Record<FieldName, string>>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [touched, setTouched] = React.useState<Partial<Record<FieldName, boolean>>>({});
  const [visible, setVisible] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const errors = validate(values);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ currentPassword: true, newPassword: true, confirmPassword: true });
    if (Object.keys(errors).length || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiPost(
        "/auth/change-password",
        { old_password: values.currentPassword, new_password: values.newPassword },
        token,
      );
      // The server revokes every older token on password change and returns a fresh one.
      if (data?.access_token) {
        setToken(data.access_token);
      }
      showSuccess(data?.message || "Password changed");
      router.back();
    } catch (err: any) {
      showError(err?.message || "Could not change password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StackHeader title="Change password" subtitle="Keep your account secure" backHref="/field/account" />
      <main className="mx-auto max-w-3xl p-4">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-lg bg-white p-5 shadow-card">
          {FIELDS.map((field, index) => (
            <div key={field.name} className="flex flex-col gap-1">
              <label className="field-label" htmlFor={field.name}>
                {field.label}
              </label>
              <div className="relative">
                <input
                  id={field.name}
                  type={visible ? "text" : "password"}
                  className="input h-[52px] pl-4 pr-12"
                  value={values[field.name]}
                  onChange={(event) => setValues((v) => ({ ...v, [field.name]: event.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, [field.name]: true }))}
                  autoComplete={field.autoComplete}
                  autoCapitalize="none"
                  autoCorrect="off"
                  disabled={submitting}
                  autoFocus={index === 0}
                />
                {index === 0 ? (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "Hide passwords" : "Show passwords"}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray2"
                  >
                    {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                ) : null}
              </div>
              {errors[field.name] && touched[field.name] ? (
                <p className="field-error mt-1">{errors[field.name]}</p>
              ) : null}
            </div>
          ))}
          <PrimaryButton type="submit" text="Update password" loading={submitting} className="mt-2" />
        </form>
      </main>
    </>
  );
}
