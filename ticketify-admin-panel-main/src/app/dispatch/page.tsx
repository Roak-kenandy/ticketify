"use client";

import React from "react";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { AdminAuth } from "@/lib/admin-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import moment from "moment";

const REFRESH_MS = 30_000;

export default function DispatchPage() {
  const router = useRouter();
  const [overview, setOverview] = React.useState<any>(null);
  const [operations, setOperations] = React.useState<any>(null);
  const [loadingOps, setLoadingOps] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [isCeo, setIsCeo] = React.useState(false);

  const loadOperations = React.useCallback(() => {
    return axiosInterceptorInstance.get("/dashboard/operations").then((res) => {
      setOperations(res.data);
      setLastUpdated(new Date());
    });
  }, []);

  const loadOverview = React.useCallback(() => {
    return axiosInterceptorInstance
      .get("/dispatch/overview")
      .then((res) => setOverview(res.data));
  }, []);

  React.useEffect(() => {
    if (!AdminAuth.getToken()) {
      router.push("/auth/login");
      return;
    }
    if (!AdminAuth.canViewDispatchBoard()) {
      router.replace("/");
      return;
    }
    setIsCeo(AdminAuth.isCeo());

    loadOperations()
      .catch(console.error)
      .finally(() => setLoadingOps(false));
    loadOverview().catch(console.error);

    const interval = setInterval(() => {
      loadOperations().catch(console.error);
      loadOverview().catch(console.error);
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [router, loadOperations, loadOverview]);

  const regions = operations?.regions;
  const tech = operations?.technicians ?? overview?.technicians;

  const dark = isCeo;
  const panel = dark
    ? "border-white/10 bg-white/5"
    : "border-border bg-card";
  const muted = dark ? "text-slate-400" : "text-muted-foreground";

  const regionCards = regions
    ? [
        regions.male,
        regions.hulhumale,
        regions.transport_lm,
      ].filter(Boolean)
    : [];

  return (
    <div
      className={`min-h-full pb-16 px-4 py-6 md:px-10 md:py-10 ${
        dark
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white"
          : "bg-background text-foreground"
      }`}
    >
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Operations board
            </h1>
            <p className={`mt-1 text-sm ${muted}`}>
              Regions · technicians · pools
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {lastUpdated && (
              <span className={`text-xs ${muted}`}>
                Updated {moment(lastUpdated).fromNow()}
              </span>
            )}
            <Link
              href="/"
              className={`text-sm underline ${dark ? "text-blue-300" : "text-primary"}`}
            >
              Back to map
            </Link>
          </div>
        </header>

        {loadingOps && <p className={muted}>Loading…</p>}

        {regionCards.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Regions</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {regionCards.map((r: any) => (
                <RegionCard
                  key={r.label}
                  title={r.label}
                  dark={dark}
                  unassigned={r.unassigned_new ?? 0}
                  assignedNew={r.assigned_new ?? 0}
                  inProgress={r.in_progress ?? 0}
                />
              ))}
            </div>
          </section>
        )}

        {operations && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Technicians</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                dark={dark}
                label="Online"
                value={tech?.online ?? 0}
                accent="text-emerald-400"
              />
              <StatCard
                dark={dark}
                label="Offline"
                value={tech?.offline ?? 0}
                accent="text-red-300"
              />
              <StatCard
                dark={dark}
                label="Busy"
                value={tech?.busy ?? 0}
                accent="text-yellow-300"
              />
              <StatCard
                dark={dark}
                label="Assign pool"
                value={tech?.auto_assign_eligible ?? 0}
              />
            </div>
          </section>
        )}

        {overview && (
          <section>
            <h2 className="text-lg font-semibold mb-3">
              Unassigned NEW (
              {overview.unassigned_pools?.reduce(
                (n: number, p: any) => n + (p.count ?? 0),
                0,
              ) ?? 0}
              )
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {overview.unassigned_pools?.map((pool: any) => (
                <div
                  key={pool.team_id}
                  className={`rounded-xl border p-5 ${panel}`}
                >
                  <p className="text-4xl font-bold tabular-nums">{pool.count}</p>
                  <p className={`text-sm mt-1 ${muted}`}>in pool</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function RegionCard({
  title,
  dark,
  unassigned,
  assignedNew,
  inProgress,
}: {
  title: string;
  dark: boolean;
  unassigned: number;
  assignedNew: number;
  inProgress: number;
}) {
  const panel = dark
    ? "border-white/10 bg-white/5"
    : "border-border bg-card";
  const muted = dark ? "text-slate-400" : "text-muted-foreground";

  return (
    <div className={`rounded-xl border p-6 ${panel}`}>
      <h3 className="text-xl font-semibold">{title}</h3>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className={muted}>Unassigned</dt>
          <dd className="text-3xl font-bold tabular-nums text-amber-400">
            {unassigned}
          </dd>
        </div>
        <div>
          <dt className={muted}>Assigned</dt>
          <dd className="text-3xl font-bold tabular-nums">{assignedNew}</dd>
        </div>
        <div>
          <dt className={muted}>In progress</dt>
          <dd className="text-3xl font-bold tabular-nums">{inProgress}</dd>
        </div>
      </dl>
    </div>
  );
}

function StatCard({
  dark,
  label,
  value,
  accent,
}: {
  dark: boolean;
  label: string;
  value: number;
  accent?: string;
}) {
  const panel = dark
    ? "border-white/10 bg-white/5"
    : "border-border bg-card";
  const muted = dark ? "text-slate-400" : "text-muted-foreground";

  return (
    <div className={`rounded-xl border p-4 ${panel}`}>
      <p className={`text-xs ${muted}`}>{label}</p>
      <p className={`text-3xl font-bold tabular-nums mt-1 ${accent ?? ""}`}>
        {value}
      </p>
    </div>
  );
}
