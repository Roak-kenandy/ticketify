"use client";

import React from "react";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { AdminAuth } from "@/lib/admin-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import moment from "moment";

const REFRESH_MS = 30_000;

type Kind = { label: string; count: number };
type Breakdown = {
  unassigned?: Kind[];
  assigned?: Kind[];
  in_progress?: Kind[];
};

const TONES = {
  male: {
    name: "Malé Access",
    wash: "from-sky-400/25 via-sky-400/5 to-transparent",
    number: "text-sky-200",
  },
  hulhumale: {
    name: "Hulhumalé Access",
    wash: "from-teal-400/25 via-teal-400/5 to-transparent",
    number: "text-teal-100",
  },
  transport: {
    name: "Transport · Last Mile",
    wash: "from-amber-300/25 via-amber-300/5 to-transparent",
    number: "text-amber-100",
  },
} as const;

export default function DispatchPage() {
  const router = useRouter();
  const [overview, setOverview] = React.useState<any>(null);
  const [operations, setOperations] = React.useState<any>(null);
  const [loadingOps, setLoadingOps] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

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
  const regionCards = regions
    ? [
        { key: "male" as const, region: regions.male },
        { key: "hulhumale" as const, region: regions.hulhumale },
        { key: "transport" as const, region: regions.transport_lm },
      ].filter((item) => item.region)
    : [];

  return (
    <div className="min-h-full bg-[#081018] px-4 py-6 text-slate-100 md:px-10 md:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Ticketify
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
              Operations board
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {lastUpdated && (
              <span className="text-slate-400">
                Updated {moment(lastUpdated).fromNow()}
              </span>
            )}
            <Link href="/" className="text-sky-300 underline">
              Back to map
            </Link>
          </div>
        </header>

        {loadingOps && <p className="text-slate-400">Loading…</p>}

        {operations && (
          <section className="grid gap-3 sm:grid-cols-3">
            <CrewStat label="Online" value={tech?.online ?? 0} tone="text-emerald-300" />
            <CrewStat label="Offline" value={tech?.offline ?? 0} tone="text-rose-300" />
            <CrewStat label="Busy" value={tech?.busy ?? 0} tone="text-amber-200" />
          </section>
        )}

        <div className="grid gap-5">
          {regionCards.map(({ key, region }) => (
            <RegionPanel
              key={key}
              tone={TONES[key]}
              title={region.label ?? TONES[key].name}
              unassigned={region.unassigned_new ?? 0}
              assigned={region.assigned_new ?? 0}
              inProgress={region.in_progress ?? 0}
              breakdown={region.breakdown}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const KIND_STYLES: { match: RegExp; box: string; number: string }[] = [
  { match: /fault/i, box: "border-l-rose-400 bg-rose-500/15", number: "text-rose-200" },
  { match: /new\s*connection/i, box: "border-l-sky-400 bg-sky-500/15", number: "text-sky-200" },
  { match: /reloc/i, box: "border-l-violet-400 bg-violet-500/15", number: "text-violet-200" },
  { match: /inquir/i, box: "border-l-amber-300 bg-amber-400/15", number: "text-amber-100" },
];

function kindStyle(label: string) {
  return (
    KIND_STYLES.find((style) => style.match.test(label)) ?? {
      box: "border-l-slate-400 bg-slate-500/15",
      number: "text-slate-100",
    }
  );
}

function RegionPanel({
  title,
  tone,
  unassigned,
  assigned,
  inProgress,
  breakdown,
}: {
  title: string;
  tone: (typeof TONES)[keyof typeof TONES];
  unassigned: number;
  assigned: number;
  inProgress: number;
  breakdown?: Breakdown;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0c1420]">
      <div className={`bg-gradient-to-r px-6 py-5 ${tone.wash}`}>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="grid gap-4 px-5 py-5 md:grid-cols-3 md:px-6">
        <StatusRow label="Unassigned" total={unassigned} kinds={breakdown?.unassigned} accent="text-amber-200" />
        <StatusRow label="Assigned" total={assigned} kinds={breakdown?.assigned} accent={tone.number} />
        <StatusRow label="In progress" total={inProgress} kinds={breakdown?.in_progress} accent="text-emerald-200" />
      </div>
    </section>
  );
}

const KIND_ORDER = [/fault/i, /new\s*connection/i, /reloc/i, /inquir/i];

function kindRank(label: string) {
  const index = KIND_ORDER.findIndex((pattern) => pattern.test(label));
  return index === -1 ? KIND_ORDER.length : index;
}

function StatusRow({
  label,
  total,
  kinds,
  accent,
}: {
  label: string;
  total: number;
  kinds?: Kind[];
  accent: string;
}) {
  const rows = (kinds ?? [])
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        kindRank(a.label) - kindRank(b.label) || a.label.localeCompare(b.label),
    );
  return (
    <div className="flex min-h-[11rem] flex-col rounded-2xl border border-white/10 bg-[#101a28] p-4">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className={`text-4xl font-semibold tabular-nums leading-none ${accent}`}>{total}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {rows.length ? (
          rows.map((item) => {
            const style = kindStyle(item.label);
            return (
              <div
                key={item.label}
                className={`flex h-16 flex-col justify-center rounded-lg border-l-[3px] px-3 ${style.box}`}
              >
                <span className="truncate text-[11px] uppercase tracking-wide text-slate-300">
                  {item.label}
                </span>
                <span className={`text-lg font-semibold tabular-nums leading-tight ${style.number}`}>
                  {item.count}
                </span>
              </div>
            );
          })
        ) : (
          <p className="col-span-2 flex h-16 items-center text-sm text-slate-500">None</p>
        )}
      </div>
    </div>
  );
}

function CrewStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1724] px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
