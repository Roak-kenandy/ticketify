"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileSpreadsheet,
  MapPinned,
  RefreshCw,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { AdminAPI } from "@/lib/admin-api";
import { UserStats } from "@/types/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";

const QUICK_ACTIONS = [
  {
    href: "/admin/users/create",
    icon: UserPlus,
    title: "Add a user",
    text: "Create a technician, supervisor or finance account.",
  },
  {
    href: "/admin/users",
    icon: Users,
    title: "Manage users",
    text: "Search accounts, change status or reset passwords.",
  },
  {
    href: "/admin/reports",
    icon: FileSpreadsheet,
    title: "Master report",
    text: "Filter tickets by area and type, export to Excel.",
  },
  {
    href: "/",
    icon: MapPinned,
    title: "Live map",
    text: "Track technicians and assignment load in real time.",
  },
];

export default function AdminDashboard() {
  const [stats, setStats] = React.useState<UserStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setStats(await AdminAPI.getUserStats());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const growth =
    stats && stats.totalUsers > 0
      ? Math.round((stats.newUsersThisMonth / stats.totalUsers) * 100)
      : 0;
  const roles = Object.entries(stats?.usersByRole ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const maxRole = Math.max(1, ...roles.map(([, count]) => count));

  return (
    <>
      <PageHeader
        title="Team overview"
        description="Accounts, roles and activity across the Ticketify workforce."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/admin/users/create">
                <UserPlus className="h-4 w-4" />
                Add user
              </Link>
            </Button>
          </>
        }
      />

      {error ? (
        <Card>
          <EmptyState
            variant="error"
            title="Couldn't load team statistics"
            description="The server didn't respond. Check your connection and try again."
            action={<Button onClick={load}>Try again</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total users"
              value={stats?.totalUsers ?? 0}
              icon={Users}
              tone="brand"
              loading={loading}
            />
            <StatCard
              label="Active now"
              value={stats?.activeUsers ?? 0}
              icon={UserCheck}
              tone="success"
              loading={loading}
              hint={
                stats && stats.totalUsers > 0
                  ? `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}% of all accounts`
                  : undefined
              }
            />
            <StatCard
              label="New this month"
              value={stats?.newUsersThisMonth ?? 0}
              icon={UserPlus}
              tone="info"
              loading={loading}
            />
            <StatCard
              label="Monthly growth"
              value={`${growth}%`}
              icon={TrendingUp}
              tone="warning"
              loading={loading}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-4">
                <CardTitle>Users by role</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-8 w-full" />
                    ))}
                  </div>
                ) : roles.length === 0 ? (
                  <EmptyState
                    compact
                    title="No role data yet"
                    description="Role totals appear once users are created."
                  />
                ) : (
                  <ul className="space-y-4">
                    {roles.map(([role, count]) => (
                      <li key={role} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium capitalize">{role}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {count} {count === 1 ? "user" : "users"}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-500"
                            style={{ width: `${(count / maxRole) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle>Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                <ul>
                  {QUICK_ACTIONS.map((action) => (
                    <li key={action.href}>
                      <Link
                        href={action.href}
                        className="group flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/60"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <action.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {action.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {action.text}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
