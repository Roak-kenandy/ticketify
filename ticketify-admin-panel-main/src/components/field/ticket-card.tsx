import { Calendar, ChevronRight, Flag, Ticket, User, UserCheck, UserX } from "lucide-react";
import moment from "moment";
import Link from "next/link";
import React from "react";
import colors from "@/lib/field/colors";
import { priorityMeta, ticketStateMeta } from "@/lib/field/ticket-meta";
import { ToneBadge } from "./ui/badge";

export function ticketHref(ticket: any) {
  return `/field/tickets/${encodeURIComponent(String(ticket?.id ?? ""))}`;
}

function TicketCard({
  ticket,
  hideState,
  showAssignee,
  footer,
}: {
  ticket: any;
  /** Hide the state pill where the list is already grouped by state. */
  hideState?: boolean;
  /** Team lists: show who holds the ticket instead of its state. */
  showAssignee?: boolean;
  /** Extra line under the badges, e.g. why the ticket is in a status list. */
  footer?: React.ReactNode;
}) {
  const state = ticketStateMeta(ticket.state);
  const priority = priorityMeta(ticket.priority);
  const created = ticket.creation_date ? moment(ticket.creation_date * 1000) : null;
  const iconTone = showAssignee ? { color: colors.primary, bg: colors.surface, icon: Ticket } : state;
  const StateIcon = iconTone.icon;
  const assignee: string | undefined = ticket.assigned_to?.user?.name;

  return (
    <Link
      href={ticketHref(ticket)}
      aria-label={`Ticket ${ticket.number ?? ""}, ${state.label}`}
      className="flex flex-col gap-2 rounded-lg border border-borderlight bg-white p-4 shadow-card transition active:scale-[0.995] active:opacity-90"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: iconTone.bg }}>
          {StateIcon ? <StateIcon className="h-5 w-5" style={{ color: iconTone.color }} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="flex-1 truncate text-base font-bold text-ink">
              {ticket.number ? `#${ticket.number}` : "Ticket"}
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-gray3" />
          </div>
          <p className="mt-0.5 truncate text-xs text-gray2">{ticket.queue?.name || "No queue"}</p>
        </div>
      </div>

      {ticket.description ? <p className="line-clamp-2 text-sm leading-5 text-ink">{ticket.description}</p> : null}

      <div className="flex flex-wrap gap-1">
        <ToneBadge tone={priority} size="sm" showIcon />
        {showAssignee ? (
          <ToneBadge
            tone={
              assignee
                ? { label: assignee, color: colors.success, bg: colors.successBg, icon: UserCheck }
                : { label: "Unassigned", color: colors.gray2, bg: colors.surface, icon: UserX }
            }
            size="sm"
            showIcon
          />
        ) : !hideState ? (
          <ToneBadge tone={state} size="sm" />
        ) : null}
        {ticket.stage?.name ? (
          <ToneBadge tone={{ label: ticket.stage.name, color: colors.primary, bg: colors.surface, icon: Flag }} size="sm" />
        ) : null}
      </div>

      {footer}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-borderlight pt-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <User className="h-[13px] w-[13px] shrink-0 text-gray3" />
          <span className="truncate text-xs text-gray2">{ticket.contact?.name || "No contact"}</span>
        </div>
        {created ? (
          <div className="flex shrink-0 items-center gap-1">
            <Calendar className="h-[13px] w-[13px] text-gray3" />
            <span className="text-xs text-gray2">{created.format("DD MMM YYYY")}</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export default React.memo(TicketCard);
