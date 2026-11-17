"use client";

import { CheckCheck, MapPinOff, Moon, RefreshCw, Search, XCircle } from "lucide-react";
import moment from "moment";
import { useRouter } from "next/navigation";
import React from "react";
import ProfileCard from "@/components/field/home/profile-card";
import StatsCard from "@/components/field/home/stats-card";
import StatusBoardCard from "@/components/field/home/status-board-card";
import TicketCard from "@/components/field/ticket-card";
import { EmptyState, ErrorState, InlineBanner, TicketCardSkeleton } from "@/components/field/ui/state-views";
import { matchesQueue, QueueFilter, useQueueFilter } from "@/components/field/ui/queue-filter";
import { apiGet } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { fieldCardGrid, fieldContainer } from "@/lib/field/layout";
import { showError } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { presenceFromUser } from "@/lib/field/ticket-meta";
import { boardFromTickets, useStatusBoard } from "@/lib/field/status-board";
import { useTickets } from "@/lib/field/tickets";
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
  const { tickets, syncedAt, error: syncError, refresh } = useTickets();
  const { setup: tracking } = useTrackingSetup();
  const { board: remoteBoard, error: boardError, reload: reloadBoard } = useStatusBoard();
  const [query, setQuery] = React.useState("");
  const [queue, setQueue] = useQueueFilter();
  const [refreshing, setRefreshing] = React.useState(false);

  const onShift = presenceFromUser(user) !== "OFFLINE";
  const loaded = syncedAt != null;
  // Ooredoo: reuse the ticket list — a second status-board call was doubling FMS load.
  const board =
    user?.source === "OOREDOO" ? boardFromTickets(tickets) : remoteBoard;

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
      await Promise.all([refresh({ force: true }), refreshProfile(), reloadBoard()]);
    } catch (error: any) {
      showError(error?.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const myTicketsFiltered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => matchesQuery(ticket, q) && matchesQueue(ticket, queue));
  }, [tickets, query, queue]);

  let empty: React.ReactNode = null;
  if (myTicketsFiltered.length === 0) {
    if (!loaded && !syncError) {
      empty = (
        <div className={cn(fieldCardGrid, "mt-2")}>
          <TicketCardSkeleton />
          <TicketCardSkeleton />
          <TicketCardSkeleton />
        </div>
      );
    } else if (!loaded && syncError) {
      empty = <ErrorState message={syncError} onRetry={onRefresh} />;
    } else if (query.trim()) {
      empty = <EmptyState icon={Search} title="No matches" message="Try a different ticket number or customer name." />;
    } else if (queue !== "ALL") {
      empty = (
        <EmptyState
          icon={CheckCheck}
          title="Nothing of this type"
          message="No tickets of this type assigned to you. Choose All to see every ticket."
        />
      );
    } else {
      empty = (
        <EmptyState
          icon={CheckCheck}
          title="No tickets yet"
          message="Tickets assigned to you will show up here."
        />
      );
    }
  }

  return (
    <>
      <ProfileCard />
      <main className={cn(fieldContainer.wide, "flex flex-col gap-4 p-4 pb-16")}>
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StatsCard tickets={tickets} loading={!loaded} />
          <StatusBoardCard board={board} error={boardError} />
        </div>

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink">My tickets</h2>
            <p className="mt-0.5 text-[13px] text-gray2">
              Tickets assigned to you
              {syncedAt ? ` · updated ${moment(syncedAt).format("h:mm A")}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-borderlight bg-white text-primary disabled:opacity-60"
          >
            <RefreshCw className={refreshing ? "h-[18px] w-[18px] animate-spin" : "h-[18px] w-[18px]"} />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-borderlight bg-white px-3">
          <Search className="h-[18px] w-[18px] shrink-0 text-gray3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticket number, customer or text"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-[46px] min-w-0 flex-1 bg-transparent text-base sm:text-sm text-ink outline-none placeholder:text-gray3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <XCircle className="h-[18px] w-[18px] text-gray3" />
            </button>
          ) : null}
        </div>

        <QueueFilter value={queue} onChange={setQueue} tickets={loaded ? tickets : undefined} />

        <div className="-mt-2">
          {myTicketsFiltered.length ? (
            <div className={cn(fieldCardGrid, "pt-4")}>
              {myTicketsFiltered.map((ticket: any, index: number) => (
                <TicketCard key={String(ticket?.id ?? index)} ticket={ticket} />
              ))}
            </div>
          ) : (
            empty
          )}
        </div>
      </main>
    </>
  );
}
