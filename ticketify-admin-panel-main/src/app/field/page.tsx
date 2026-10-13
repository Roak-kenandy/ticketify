"use client";

import { CheckCheck, MapPinOff, Moon, RefreshCw, Search, XCircle } from "lucide-react";
import moment from "moment";
import { useRouter } from "next/navigation";
import React from "react";
import ProfileCard from "@/components/field/home/profile-card";
import StatsCard from "@/components/field/home/stats-card";
import TicketCard from "@/components/field/ticket-card";
import { EmptyState, ErrorState, InlineBanner, TicketCardSkeleton } from "@/components/field/ui/state-views";
import { apiGet } from "@/lib/field/api";
import { showError } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { presenceFromUser } from "@/lib/field/ticket-meta";
import { teamTicketList, useTickets } from "@/lib/field/tickets";
import { isTrackingStale, lastHeardAt, useTrackingSetup } from "@/lib/field/tracking";

function matchesQuery(ticket: any, query: string) {
  if (!query) {
    return true;
  }
  return [ticket?.number, ticket?.id, ticket?.contact?.name, ticket?.description]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, user, updateUser } = useSession();
  const { tickets, teamTickets, syncedAt, error: syncError, refresh } = useTickets();
  const { setup: tracking } = useTrackingSetup();
  const [query, setQuery] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  const onShift = presenceFromUser(user) !== "OFFLINE";
  const loaded = syncedAt != null;

  const refreshProfile = React.useCallback(async () => {
    if (!token) {
      return;
    }
    const data = await apiGet("/users/me", token, { silent: true });
    if (data) {
      updateUser((current: any) => ({ ...current, ...data }));
    }
  }, [token, updateUser]);

  React.useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh({ force: true }), refreshProfile()]);
    } catch (error: any) {
      showError(error?.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const sections = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (Array.isArray(teamTickets) ? teamTickets : [])
      .filter((group: any) => group?.team?.name)
      .map((group: any) => ({
        key: String(group.team.id ?? group.team.name),
        title: group.team.name as string,
        unavailable: Boolean(group.error),
        data: teamTicketList(group).filter((ticket) => matchesQuery(ticket, q)),
      }))
      .filter((section) => section.data.length > 0 || (!q && section.unavailable));
  }, [teamTickets, query]);

  let empty: React.ReactNode = null;
  if (!sections.length) {
    if (!loaded && !syncError) {
      empty = (
        <div className="mt-2 flex flex-col gap-2">
          <TicketCardSkeleton />
          <TicketCardSkeleton />
          <TicketCardSkeleton />
        </div>
      );
    } else if (!loaded && syncError) {
      empty = <ErrorState message={syncError} onRetry={onRefresh} />;
    } else if (query.trim()) {
      empty = <EmptyState icon={Search} title="No matches" message="Try a different ticket number or customer name." />;
    } else {
      empty = (
        <EmptyState icon={CheckCheck} title="Queue is clear" message="There are no new tickets in your teams right now." />
      );
    }
  }

  return (
    <>
      <ProfileCard />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-16">
        {!onShift ? (
          <InlineBanner
            icon={Moon}
            message="You're Offline. Switch to Available to receive jobs and share your location."
          />
        ) : tracking && isTrackingStale(tracking) ? (
          <InlineBanner
            icon={MapPinOff}
            message={
              lastHeardAt(tracking)
                ? `No location received since ${moment(lastHeardAt(tracking)).format("h:mm A, DD MMM")}. Open Traccar Client and make sure Service status is on.`
                : "Your location is not being shared yet. Set up Traccar Client on this phone."
            }
            actionLabel="Set up"
            onAction={() => router.push("/field/tracking")}
          />
        ) : null}
        {loaded && syncError ? (
          <InlineBanner tone="error" message={syncError} actionLabel="Retry" onAction={onRefresh} />
        ) : null}

        <StatsCard tickets={tickets} loading={!loaded} />

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">Team queue</h2>
            <p className="mt-0.5 text-[13px] text-gray2">
              New tickets across your teams
              {syncedAt ? ` · updated ${moment(syncedAt).format("h:mm A")}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-borderlight bg-white text-primary disabled:opacity-60"
          >
            <RefreshCw className={refreshing ? "h-[18px] w-[18px] animate-spin" : "h-[18px] w-[18px]"} />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-borderlight bg-white px-3">
          <Search className="h-[18px] w-[18px] text-gray3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticket number, customer or text"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-[46px] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-gray3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <XCircle className="h-[18px] w-[18px] text-gray3" />
            </button>
          ) : null}
        </div>

        <div className="-mt-2">
          {sections.map((section) => (
            <section key={section.key}>
              <div className="flex items-center justify-between pb-2 pt-4">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.6px] text-primary">{section.title}</h3>
                <span className="text-xs font-semibold text-gray2">
                  {section.unavailable ? "Unavailable" : section.data.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {section.data.map((ticket: any, index: number) => (
                  <TicketCard key={String(ticket?.id ?? index)} ticket={ticket} />
                ))}
              </div>
            </section>
          ))}
          {empty}
        </div>
      </main>
    </>
  );
}
