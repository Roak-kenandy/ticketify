"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Shield,
  UserCheck,
  UserX,
} from "lucide-react";
import { AdminAPI } from "@/lib/admin-api";
import { initials } from "@/lib/access";
import { UserProfile } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";

function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [statusSaving, setStatusSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setUser(await AdminAPI.getUserById(userId));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  async function toggleStatus() {
    if (!user) return;
    setStatusSaving(true);
    try {
      await AdminAPI.toggleUserStatus(user.id);
      toast.success(`${user.name} is now ${user.availability ? "inactive" : "active"}`);
      await load();
    } catch {
      toast.error("Couldn't update the status");
    } finally {
      setStatusSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Card>
        <EmptyState
          variant="no-results"
          title="User not found"
          description="This account may have been deleted, or the link is wrong."
          action={
            <Button asChild>
              <Link href="/admin/users">Back to users</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const details = [
    { icon: Mail, label: "Email", value: user.email },
    { icon: Phone, label: "Phone", value: user.phone || "—" },
    { icon: Shield, label: "Role", value: user.role?.name ?? "—" },
    { icon: Calendar, label: "Created", value: formatDateTime(user.created_at) },
    { icon: Clock, label: "Last sign-in", value: formatDateTime(user.last_login) },
    { icon: Hash, label: "CRM user ID", value: user.crm_user_id || "—", mono: true },
  ];

  const timeline = [
    { label: "Account created", at: user.created_at, tone: "bg-success" },
    user.last_login ? { label: "Last sign-in", at: user.last_login, tone: "bg-info" } : null,
    { label: "Profile updated", at: user.updated_at, tone: "bg-muted-foreground" },
  ].filter(Boolean) as { label: string; at: string; tone: string }[];

  return (
    <>
      <PageHeader backHref="/admin/users" backLabel="Users" title="User profile" />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="truncate text-xl font-semibold">{user.name}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="brand">{user.role?.name}</Badge>
              <Badge dot variant={user.availability ? "success" : "outline"}>
                {user.availability ? "Active" : "Inactive"}
              </Badge>
              <span className="truncate text-sm text-muted-foreground">{user.email}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <KeyRound className="h-4 w-4" />
              Reset password
            </Button>
            <Button
              variant={user.availability ? "outline" : "default"}
              onClick={toggleStatus}
              disabled={statusSaving}
            >
              {statusSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : user.availability ? (
                <UserX className="h-4 w-4" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              {user.availability ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {details.map((item) => (
                <div key={item.label} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                    <dd
                      className={
                        item.mono
                          ? "flex items-center gap-1 break-all font-mono text-xs"
                          : "truncate text-sm font-medium"
                      }
                    >
                      {item.value}
                      {item.mono && item.value !== "—" && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(item.value);
                            toast.success("Copied");
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Copy ${item.label}`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-5 border-l pl-5">
              {timeline.map((item) => (
                <li key={item.label} className="relative">
                  <span
                    aria-hidden
                    className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card ${item.tone}`}
                  />
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(item.at)}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <ResetPasswordDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        userId={user.id}
        userName={user.name}
      />
    </>
  );
}

function ResetPasswordDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}) {
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setPassword("");
      setShow(false);
      setError("");
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    setSaving(true);
    try {
      await AdminAPI.resetPassword({ user_id: userId, new_password: password });
      toast.success(`Password updated for ${userName}`);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.response?.data?.message || "Couldn't reset the password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {userName}. They&apos;ll use it the next time they sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                autoComplete="new-password"
                autoFocus
                className="pr-10"
                aria-invalid={Boolean(error)}
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className={error ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
              {error || "At least 6 characters."}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !password}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
