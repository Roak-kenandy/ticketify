"use client";

import { ChevronRight, RefreshCw, Star, User } from "lucide-react";
import moment from "moment";
import Link from "next/link";
import React from "react";
import { ScreenHeader } from "@/components/field/shell/headers";
import { EmptyState, ErrorState, Skeleton } from "@/components/field/ui/state-views";
import { apiGet } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { fieldCardGrid, fieldContainer } from "@/lib/field/layout";
import { showError } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";

/** Show the last list immediately; refresh in the background on each visit. */
let cachedFeedbacks: any[] | null = null;

export default function ReviewsPage() {
  const { token } = useSession();
  const [feedbacks, setFeedbacks] = React.useState<any[] | null>(cachedFeedbacks);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const inFlight = React.useRef(false);

  const load = React.useCallback(
    async (mode: "quiet" | "refresh") => {
      if (!token || inFlight.current) {
        return;
      }
      inFlight.current = true;
      if (mode === "refresh") {
        setRefreshing(true);
      }
      try {
        const data = await apiGet("/feedbacks", token, { silent: true, timeoutMs: 30000 });
        const list = Array.isArray(data) ? data : [];
        cachedFeedbacks = list;
        setFeedbacks(list);
        setError("");
      } catch (err: any) {
        const message = err?.message || "Could not load reviews";
        setError(message);
        if (mode === "refresh") {
          showError(message);
        }
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [token],
  );

  React.useEffect(() => {
    load("quiet");
  }, [load]);

  const summary = React.useMemo(() => {
    const list = feedbacks ?? [];
    if (!list.length) {
      return null;
    }
    const total = list.reduce((sum, item) => sum + (Number(item?.feedback?.rating) || 0), 0);
    return { average: total / list.length, count: list.length };
  }, [feedbacks]);

  return (
    <>
      <ScreenHeader title="Reviews" subtitle="What customers say about your work" wide />
      <main className={cn(fieldContainer.wide, "flex flex-col gap-2 p-4 pb-16")}>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => load("refresh")}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-full border border-borderlight bg-white px-3 py-1.5 text-[13px] font-semibold text-primary disabled:opacity-60"
          >
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </button>
        </div>
        {summary ? (
          <div className="mb-1 flex items-center gap-2 rounded-lg bg-white p-4 shadow-card">
            <Star className="h-[22px] w-[22px] fill-secondary text-secondary" />
            <span className="text-[22px] font-bold text-ink">{summary.average.toFixed(1)}</span>
            <span className="flex-1 text-[13px] text-gray2">
              average from {summary.count} review{summary.count === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}
        {feedbacks?.length ? (
          <div className={fieldCardGrid}>
            {feedbacks.map((item, index) => (
              <ReviewCard key={String(item?.feedback?.id ?? index)} data={item} />
            ))}
          </div>
        ) : feedbacks === null && !error ? (
          <div className={fieldCardGrid}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg bg-white p-4">
                <Skeleton width={110} height={16} />
                <Skeleton height={14} />
                <Skeleton width="60%" height={14} />
              </div>
            ))}
          </div>
        ) : feedbacks === null && error ? (
          <ErrorState message={error} onRetry={() => load("refresh")} />
        ) : (
          <EmptyState
            icon={Star}
            title="No reviews yet"
            message="When customers rate a ticket you closed, their review shows up here."
          />
        )}
      </main>
    </>
  );
}

function ReviewCard({ data }: { data: any }) {
  const rating = Math.max(0, Math.min(5, Number(data?.feedback?.rating) || 0));
  const ticket = data?.ticket;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              className={i < rating ? "h-[18px] w-[18px] fill-secondary text-secondary" : "h-[18px] w-[18px] text-bordergray"}
            />
          ))}
        </div>
        <span className="text-xs text-gray2">
          {data?.feedback?.created_at ? moment(data.feedback.created_at).format("DD MMM YYYY") : ""}
        </span>
      </div>
      {data?.feedback?.feedback ? (
        <p className="text-[15px] leading-[21px] text-ink">“{data.feedback.feedback}”</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-borderlight pt-2">
        <span className="flex min-w-0 items-center gap-1">
          <User className="h-3.5 w-3.5 text-gray2" />
          <span className="truncate text-[13px] text-gray2">
            {ticket?.contact?.person_name?.full_name || "Customer"}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[13px] font-semibold text-primary">#{ticket?.number ?? "—"}</span>
          <ChevronRight className="h-4 w-4 text-gray3" />
        </span>
      </div>
    </>
  );
  const className = "flex flex-col gap-2 rounded-lg border border-borderlight bg-white p-4 shadow-card";
  return ticket?.id ? (
    <Link
      href={`/field/tickets/${encodeURIComponent(String(ticket.id))}`}
      aria-label={`${rating} star review for ticket ${ticket?.number ?? ""}`}
      className={`${className} active:opacity-90`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
