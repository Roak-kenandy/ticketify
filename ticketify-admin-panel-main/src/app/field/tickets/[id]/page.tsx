"use client";

import {
  AlertCircle,
  Barcode,
  Calendar,
  ChevronRight,
  CreditCard,
  GitCommitHorizontal,
  Box,
  MapPin,
  Network,
  Paperclip,
  Phone,
  PhoneCall,
  Plus,
  Radio,
  RefreshCw,
  User,
  type LucideIcon,
} from "lucide-react";
import moment from "moment";
import { useParams } from "next/navigation";
import React from "react";
import { StackHeader } from "@/components/field/shell/headers";
import CompletionChecklist from "@/components/field/ticket/completion-checklist";
import ActivityDetailModal from "@/components/field/ticket/modals/activity-details";
import AddAttachmentModal from "@/components/field/ticket/modals/add-attachment";
import BillingWorkflowModal from "@/components/field/ticket/modals/billing-workflow";
import InventoryModal from "@/components/field/ticket/modals/inventory";
import LmHandoffModal from "@/components/field/ticket/modals/lm-handoff";
import ProvisioningModal from "@/components/field/ticket/modals/provisioning";
import ScheduleVisitModal from "@/components/field/ticket/modals/schedule-visit";
import { AddNoteModal, CloseTicketModal, ProgressTicketModal } from "@/components/field/ticket/modals/text-modals";
import ViewImageModal from "@/components/field/ticket/modals/view-image";
import ViewInfoModal from "@/components/field/ticket/modals/view-info";
import { useFileUrl } from "@/components/field/ticket/use-file-url";
import { ToneBadge } from "@/components/field/ui/badge";
import { PrimaryButton } from "@/components/field/ui/button";
import { EmptyState, ErrorState, InlineBanner, Skeleton } from "@/components/field/ui/state-views";
import { apiGet, apiPut } from "@/lib/field/api";
import { dialable } from "@/lib/field/app";
import { cn } from "@/lib/field/cn";
import colors from "@/lib/field/colors";
import { fieldContainer } from "@/lib/field/layout";
import {
  hasPendingLastMile,
  hasPendingNoResponse,
  lmStatusLabel,
  resolveCrmActivityState,
} from "@/lib/field/crm-activity";
import { showError, showInfo, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { priorityMeta, ticketStateMeta, type Tone } from "@/lib/field/ticket-meta";
import { sameTicketId, teamTicketList, useTickets } from "@/lib/field/tickets";
import type { ClosureEvaluation } from "@/types/field-workflow";

type ModalName =
  | "activity"
  | "attachment"
  | "note"
  | "image"
  | "close"
  | "progress"
  | "schedule"
  | "billing"
  | "lm"
  | "info"
  | "inventory"
  | "provisioning";

function findNextStage(ticket: any) {
  const order = ticket?.stage?.order ?? 0;
  return ticket?.queue_info?.stages?.find((stage: any) => stage.order === order + 1);
}

function crmDate(seconds?: number, format = "DD MMM YYYY") {
  return seconds ? moment(seconds * 1000).format(format) : "";
}

export default function TicketDetailsPage() {
  const params = useParams<{ id: string }>();
  const ticketId = decodeURIComponent(String(params?.id ?? ""));
  const { token, user } = useSession();
  const { tickets, teamTickets, notifyTicketMutation } = useTickets();

  const storeTicket = React.useMemo(
    () => tickets.find((t: any) => sameTicketId(t.id, ticketId)),
    [tickets, ticketId],
  );
  // Seed the header from whatever list the technician opened this from.
  const seedTicket = React.useMemo(
    () =>
      storeTicket ??
      teamTickets.flatMap((group: any) => teamTicketList(group)).find((t: any) => sameTicketId(t.id, ticketId)) ?? {
        id: ticketId,
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticketId],
  );

  const [data, setData] = React.useState<any>();
  const nextStage = React.useMemo(() => findNextStage(data), [data]);
  const [context, setContext] = React.useState<any>(null);
  const [billingWorkflow, setBillingWorkflow] = React.useState<any>(null);
  const [closure, setClosure] = React.useState<ClosureEvaluation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [noResponseBusy, setNoResponseBusy] = React.useState(false);

  const [selectedActivity, setSelectedActivity] = React.useState<any>();
  const [selectedImage, setSelectedImage] = React.useState<any>();
  const [modal, setModal] = React.useState<ModalName | null>(null);
  const closeModal = React.useCallback(() => setModal(null), []);
  const [resumeClose, setResumeClose] = React.useState(false);

  const applyToLocalState = React.useCallback(
    (updated: any) => {
      if (!updated) {
        return;
      }
      setData((prev: any) => ({ ...(prev ?? seedTicket), ...updated }));
    },
    [seedTicket],
  );

  const fetchTicket = React.useCallback(async () => {
    const ticketData = await apiGet(`/tickets/${ticketId}`, token);
    if (ticketData) {
      setData(ticketData);
    }
  }, [ticketId, token]);

  const fetchContext = React.useCallback(async () => {
    try {
      setContext(await apiGet(`/tickets/${ticketId}/context`, token, { silent: true }));
    } catch {
      // The context only drives blocking banners; the ticket itself still loads.
    }
  }, [ticketId, token]);

  const fetchBillingWorkflow = React.useCallback(async () => {
    try {
      setBillingWorkflow(await apiGet(`/billing/tickets/${ticketId}/workflow`, token, { silent: true }));
    } catch {
      setBillingWorkflow(null);
    }
  }, [ticketId, token]);

  const fetchClosure = React.useCallback(async () => {
    try {
      setClosure(await apiGet(`/closure/tickets/${ticketId}`, token, { silent: true }));
    } catch {
      // Closure checks are advisory here; the API enforces them on close.
      setClosure(null);
    }
  }, [ticketId, token]);

  const loadAll = React.useCallback(
    async (mode: "initial" | "refresh" | "quiet") => {
      if (!ticketId || !token) {
        return;
      }
      if (mode === "refresh") {
        setRefreshing(true);
      }
      try {
        await Promise.all([fetchTicket(), fetchContext(), fetchBillingWorkflow(), fetchClosure()]);
        setLoadError("");
      } catch (error: any) {
        const message = error?.message || "Could not load this ticket";
        setLoadError(message);
        if (mode === "refresh") {
          showError(message);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ticketId, token, fetchTicket, fetchContext, fetchBillingWorkflow, fetchClosure],
  );

  React.useEffect(() => {
    loadAll("initial");
  }, [loadAll]);

  React.useEffect(() => {
    if (storeTicket) {
      applyToLocalState(storeTicket);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeTicket?.state, storeTicket?.stage?.order]);

  const refreshAfterChange = React.useCallback(() => {
    loadAll("quiet");
  }, [loadAll]);

  const view = data ?? seedTicket;
  const isMine = Boolean(user?.crm_user_id) && user?.crm_user_id === view?.assigned_to?.user?.id;
  const isClosed = view?.state === "CLOSED" || view?.stage?.name === "Closed";
  const canEdit = isMine && !isClosed;
  const activities: any[] = data?.activities?.content ?? [];
  const notes: any[] = data?.notes?.content ?? [];
  const attachments: any[] = data?.attachments?.content ?? [];
  const services: any[] = data?.contact?.services?.content ?? [];
  const phone: string | undefined = data?.contact?.phone?.number;
  const dialablePhone = dialable(phone);
  const customerName: string | undefined =
    data?.contact?.person_name?.full_name ||
    data?.contact?.company_name ||
    data?.contact?.name ||
    seedTicket?.contact?.name;

  const lmBlocking = Boolean(context?.pending_lm) || hasPendingLastMile(activities);
  const noResponseBlocking =
    Boolean(context?.pending_no_response) ||
    hasPendingNoResponse(context?.no_response_activities) ||
    hasPendingNoResponse(activities);
  const closeStageActive = Boolean(nextStage) && data?.queue_info?.stages?.length === nextStage?.order;
  const billingBlocksClose = isMine && billingWorkflow?.can_close_ticket === false && closeStageActive;
  const closureBlocker =
    closure?.enforced && !closure.ready
      ? closure.checks.find((check) => !check.ok && check.severity === "block")
      : undefined;
  const showChecklist = canEdit && view?.state === "IN_PROGRESS" && Boolean(closure?.checks.length);

  async function assignUser() {
    setSubmitted(true);
    try {
      const assigned = await apiPut(`/tickets/${ticketId}/assign`, undefined, token);
      const updated = await notifyTicketMutation(ticketId, { state: assigned?.state ?? "NEW" }, assigned);
      applyToLocalState(updated);
      showSuccess("Ticket assigned to you");
    } catch (error: any) {
      showError(error?.message || "Could not assign the ticket");
    } finally {
      setSubmitted(false);
    }
  }

  async function startTroubleshooting() {
    setSubmitted(true);
    try {
      const result = await apiPut(`/tickets/${ticketId}/start`, { stage_id: nextStage?.id }, token, {
        timeoutMs: 30000,
      });
      if (result?.state !== "IN_PROGRESS") {
        throw new Error("The CRM did not move the ticket to In progress. Please try again.");
      }
      const updated = await notifyTicketMutation(
        ticketId,
        { state: result.state, stage: result.stage ?? nextStage ?? data?.stage },
        { ...view, ...result, id: view?.id ?? ticketId },
      );
      applyToLocalState(updated);
      showSuccess("Work started, ticket is In progress");
    } catch (error: any) {
      showError(error?.message || "Could not start the ticket");
    } finally {
      setSubmitted(false);
    }
  }

  async function toggleNoResponse() {
    setNoResponseBusy(true);
    try {
      const result = await apiPut(`/tickets/${ticketId}/no-response`, undefined, token);
      showSuccess(result?.message || "Updated");
      refreshAfterChange();
    } catch (error: any) {
      showError(error?.message || "Could not update No response");
    } finally {
      setNoResponseBusy(false);
    }
  }

  async function closeWorkflowModal() {
    setModal(null);
    if (!resumeClose) {
      return;
    }
    setResumeClose(false);
    try {
      const next: ClosureEvaluation = await apiGet(`/closure/tickets/${ticketId}`, token, { silent: true });
      setClosure(next);
      if (next.ready || !next.enforced) {
        setModal("close");
      }
    } catch {
      // The checklist refreshes on its own; the technician can tap Close again.
    }
  }

  function onPrimaryPress() {
    if (submitted) {
      return;
    }
    if (lmBlocking) {
      showInfo("Finish Last Mile cabling before continuing this ticket.");
      return;
    }
    if (!isMine) {
      assignUser();
      return;
    }
    if (view?.state === "NEW") {
      startTroubleshooting();
      return;
    }
    if (closeStageActive) {
      if (noResponseBlocking) {
        showInfo("Clear No response before closing this ticket.");
        return;
      }
      if (billingBlocksClose) {
        showInfo(billingWorkflow?.block_close_reason ?? "Complete charges and customer payment before closing.");
        setModal("billing");
        return;
      }
      if (closureBlocker) {
        showInfo(closureBlocker.message || "Finish the closing checklist first.");
        if (closureBlocker.action) {
          setResumeClose(true);
          setModal(closureBlocker.action);
        }
        return;
      }
      setModal("close");
      return;
    }
    setModal("progress");
  }

  const primaryLabel = lmBlocking
    ? "Waiting for Last Mile"
    : !isMine
      ? "Assign to me"
      : view?.state === "NEW"
        ? `Start ${nextStage?.name ?? "work"}`
        : closeStageActive
          ? "Close ticket"
          : `Move to ${nextStage?.name ?? "next stage"}`;
  const primaryColor =
    isMine && nextStage?.colour && !closeStageActive
      ? nextStage.colour
      : closeStageActive && isMine
        ? colors.success
        : undefined;

  const stateTone = ticketStateMeta(view?.state);
  const stageTone: Tone | null = view?.stage?.name
    ? { label: view.stage.name, color: colors.white, bg: view.stage.colour || colors.primary }
    : null;
  const address = [
    data?.contact?.addresses?.[0]?.address_line_1,
    data?.contact?.addresses?.[0]?.address_line_2,
    data?.contact?.addresses?.[0]?.town_city,
  ]
    .filter(Boolean)
    .join(", ");

  const firstLoad = loading && !data;

  if (!data && !loading && loadError) {
    return (
      <div className="min-h-[100dvh]">
        <StackHeader title={`#${seedTicket?.number ?? ""}`} backHref="/field/tickets" />
        <ErrorState message={loadError} onRetry={() => loadAll("initial")} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <StackHeader
        title={view?.number ? `#${view.number}` : "Ticket"}
        subtitle={view?.queue?.name ?? view?.queue_info?.name}
        backHref="/field/tickets"
        wide
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => loadAll("refresh")}
              disabled={refreshing || !token}
              aria-label="Refresh"
              className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-5 w-5 text-white", refreshing && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => setModal("info")}
              disabled={!data}
              aria-label="Ticket progress"
              className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15 disabled:opacity-60"
            >
              <GitCommitHorizontal className="h-[22px] w-[22px] text-white" />
            </button>
          </div>
        }
      />

      <main className={cn(fieldContainer.wide, "flex flex-1 flex-col gap-3 p-4 pb-6")}>
        <section className="flex flex-col gap-3 rounded-lg border border-borderlight bg-white p-4 shadow-card">
          <div className="flex flex-wrap gap-2">
            <ToneBadge tone={stateTone} showIcon />
            {stageTone ? <ToneBadge tone={stageTone} /> : null}
            {(data?.categories ?? []).map((tag: any, index: number) => (
              <ToneBadge
                key={`${tag?.name}-${index}`}
                tone={{ label: tag?.name, color: colors.black, bg: tag?.colour || colors.surface }}
                size="sm"
              />
            ))}
          </div>
          {view?.description ? (
            <p className="whitespace-pre-line text-[15px] leading-[22px] text-ink">{view.description}</p>
          ) : null}
          {firstLoad ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton width={90} height={22} rounded />
              <Skeleton width={90} height={22} rounded />
              <Skeleton width={90} height={22} rounded />
            </div>
          ) : data?.priority_matrix ? (
            <div className="grid grid-cols-3 gap-2 border-t border-borderlight pt-3">
              {(["priority", "urgency", "impact"] as const).map((key) => (
                <div key={key} className="flex flex-col items-start gap-1">
                  <span className="caption">{key[0].toUpperCase() + key.slice(1)}</span>
                  <ToneBadge tone={priorityMeta(data.priority_matrix[key])} size="sm" showIcon />
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {isMine && lmBlocking ? (
          <InlineBanner
            icon={Network}
            message="Last Mile cabling is in progress. Continue this ticket once Transport Network completes it."
          />
        ) : null}
        {isMine && noResponseBlocking ? (
          <InlineBanner
            tone="info"
            icon={Phone}
            message="Marked as No response. Clear it before closing the ticket."
          />
        ) : null}
        {isMine &&
        view?.state === "IN_PROGRESS" &&
        (billingWorkflow?.payment_status === "pending" || billingWorkflow?.payment_status === "confirmed") ? (
          <InlineBanner
            tone={billingWorkflow.payment_status === "confirmed" ? "info" : "warning"}
            icon={CreditCard}
            message={
              billingWorkflow.payment_status === "confirmed"
                ? `Payment received (${
                    billingWorkflow.confirmed_receipt_number ?? "receipt"
                  }). Finish the work, then close the ticket.`
                : "Waiting for the customer to pay the link that was sent."
            }
            actionLabel={billingWorkflow.payment_status === "pending" ? "Open" : undefined}
            onAction={() => setModal("billing")}
          />
        ) : null}
        {showChecklist && closure ? <CompletionChecklist closure={closure} onOpen={setModal} /> : null}

        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
          <Section title="Customer">
            <InfoRow icon={User} label="Name" value={customerName} />
            {firstLoad ? (
              <>
                <Skeleton height={16} />
                <Skeleton height={16} width="70%" />
              </>
            ) : (
              <>
                <InfoRow
                  icon={Phone}
                  label="Phone"
                  value={phone}
                  href={dialablePhone ? `tel:${dialablePhone}` : undefined}
                />
                <InfoRow icon={Barcode} label="Customer code" value={data?.contact?.code} />
                <InfoRow icon={MapPin} label="Address" value={address || "No address on file"} />
              </>
            )}
            {services.length > 0 ? (
              <div className="mt-1 flex flex-col gap-2">
                <span className="caption">Services and devices</span>
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                  {services.map((item: any, index: number) => (
                    <div
                      key={String(item?.id ?? index)}
                      className="flex w-40 shrink-0 flex-col items-start gap-2 rounded-md border border-borderlight bg-surface p-3"
                    >
                      <p className="line-clamp-2 text-[13px] font-semibold text-ink">
                        {item?.product?.name ?? "Service"}
                      </p>
                      <ToneBadge
                        size="sm"
                        tone={
                          item?.state === "EFFECTIVE"
                            ? { label: "Active", color: colors.success, bg: colors.successBg }
                            : { label: item?.state ?? "Unknown", color: colors.warning, bg: colors.warningBg }
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>

          <Section
            title="Photos & attachments"
            count={attachments.length}
            actionLabel={canEdit ? "Add" : undefined}
            onAction={() => setModal("attachment")}
          >
            {firstLoad ? (
              <div className="flex flex-wrap gap-2">
                <Skeleton width={96} height={96} />
                <Skeleton width={96} height={96} />
              </div>
            ) : attachments.length === 0 ? (
              <p className="text-[13px] text-gray2">No attachments yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {attachments.map((item: any, index: number) => (
                  <AttachmentThumb
                    key={String(item?.id ?? index)}
                    fileId={item?.file?.id}
                    onClick={() => {
                      setSelectedImage(item);
                      setModal("image");
                    }}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Activities" count={activities.length}>
            {firstLoad ? (
              <Skeleton height={56} />
            ) : activities.length === 0 ? (
              <p className="text-[13px] text-gray2">No activities</p>
            ) : (
              activities.map((item: any, index: number) => {
                const state = resolveCrmActivityState(item);
                const done = state === "COMPLETED";
                return (
                  <button
                    key={String(item?.id ?? index)}
                    type="button"
                    onClick={() => {
                      setSelectedActivity(item);
                      setModal("activity");
                    }}
                    className="flex items-center gap-3 rounded-md border border-borderlight p-3 text-left active:bg-surface"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{item?.name ?? "Activity"}</span>
                      <span className="caption block">
                        {[item?.type?.name, crmDate(item?.date ?? item?.activity_date?.date)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <ToneBadge
                      size="sm"
                      tone={
                        done
                          ? { label: lmStatusLabel("COMPLETED"), color: colors.success, bg: colors.successBg }
                          : { label: lmStatusLabel(state), color: colors.warning, bg: colors.warningBg }
                      }
                    />
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray3" />
                  </button>
                );
              })
            )}
          </Section>

          <Section
            title="Notes"
            count={notes.length}
            actionLabel={canEdit ? "Add" : undefined}
            onAction={() => setModal("note")}
          >
            {firstLoad ? (
              <Skeleton height={56} />
            ) : notes.length === 0 ? (
              <p className="text-[13px] text-gray2">No notes yet</p>
            ) : (
              notes.map((item: any, index: number) => (
                <div key={String(item?.id ?? index)} className="flex flex-col gap-1 rounded-md bg-surface p-3">
                  <p className="whitespace-pre-line text-sm leading-5 text-ink">{item?.note}</p>
                  <span className="caption">{crmDate(item?.created_on, "DD MMM YYYY, h:mm A")}</span>
                </div>
              ))
            )}
          </Section>
        </div>

        {!firstLoad && !data ? <EmptyState icon={AlertCircle} title="Details unavailable" /> : null}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-borderlight bg-white shadow-sheet">
        <div
          className={cn(
            fieldContainer.wide,
            "flex flex-col gap-3 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:flex-row lg:items-center",
          )}
        >
          <div className="no-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 empty:hidden lg:mx-0 lg:flex-1 lg:flex-wrap lg:px-0">
            {phone ? (
              <ActionChip
                icon={Phone}
                label="Call"
                href={dialablePhone ? `tel:${dialablePhone}` : undefined}
              />
            ) : null}
            {canEdit ? <ActionChip icon={Calendar} label="Schedule" onClick={() => setModal("schedule")} /> : null}
            {canEdit && view?.state === "IN_PROGRESS" ? (
              <ActionChip icon={CreditCard} label="Charges" onClick={() => setModal("billing")} />
            ) : null}
            {canEdit && view?.state === "IN_PROGRESS" ? (
              <ActionChip icon={Box} label="Inventory" onClick={() => setModal("inventory")} />
            ) : null}
            {canEdit && view?.state === "IN_PROGRESS" ? (
              <ActionChip icon={Radio} label="INCA" onClick={() => setModal("provisioning")} />
            ) : null}
            {canEdit && view?.state === "IN_PROGRESS" ? (
              <ActionChip
                icon={noResponseBlocking ? PhoneCall : Phone}
                label={noResponseBlocking ? "Clear No response" : "No response"}
                onClick={toggleNoResponse}
                busy={noResponseBusy}
                active={noResponseBlocking}
              />
            ) : null}
            {canEdit && !lmBlocking ? (
              <ActionChip icon={Network} label="Last Mile" onClick={() => setModal("lm")} />
            ) : null}
          </div>
          {!isClosed && data ? (
            <PrimaryButton
              text={primaryLabel}
              loading={submitted}
              disabled={lmBlocking || (isMine && closeStageActive && noResponseBlocking)}
              onClick={onPrimaryPress}
              className="lg:w-72 lg:shrink-0"
              style={primaryColor ? { backgroundColor: primaryColor } : undefined}
            />
          ) : null}
        </div>
      </footer>

      <ActivityDetailModal visible={modal === "activity"} onClose={closeModal} activity={selectedActivity} />
      <AddAttachmentModal
        ticketId={ticketId}
        visible={modal === "attachment"}
        onClose={closeModal}
        onSuccess={refreshAfterChange}
      />
      <AddNoteModal ticketId={ticketId} visible={modal === "note"} onClose={closeModal} onSuccess={refreshAfterChange} />
      <ViewImageModal visible={modal === "image"} onClose={closeModal} image={selectedImage} />
      <CloseTicketModal
        visible={modal === "close"}
        onClose={closeModal}
        ticketId={ticketId}
        nextStage={nextStage}
        onSuccess={applyToLocalState}
      />
      <ScheduleVisitModal
        visible={modal === "schedule"}
        onClose={closeModal}
        ticketId={ticketId}
        onSuccess={refreshAfterChange}
      />
      <BillingWorkflowModal
        visible={modal === "billing"}
        onClose={closeModal}
        ticketId={ticketId}
        onUpdated={refreshAfterChange}
      />
      <InventoryModal
        visible={modal === "inventory"}
        onClose={closeWorkflowModal}
        ticketId={ticketId}
        srNumber={view?.number}
        technicianName={user?.name}
        onChanged={refreshAfterChange}
      />
      <ProvisioningModal
        visible={modal === "provisioning"}
        onClose={closeWorkflowModal}
        ticketId={ticketId}
        srNumber={view?.number}
        onChanged={refreshAfterChange}
        onOpenInventory={() => setModal("inventory")}
      />
      <LmHandoffModal visible={modal === "lm"} onClose={closeModal} ticketId={ticketId} onSuccess={refreshAfterChange} />
      {modal === "progress" ? (
        <ProgressTicketModal
          visible
          onClose={closeModal}
          ticket={data}
          setSubmitted={setSubmitted}
          nextStage={nextStage}
          onSuccess={applyToLocalState}
        />
      ) : null}
      {modal === "info" ? <ViewInfoModal visible onClose={closeModal} ticket={data} /> : null}
    </div>
  );
}

function Section({
  title,
  count,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borderlight bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">
          {title}
          {typeof count === "number" && count > 0 ? (
            <span className="text-sm font-medium text-gray2">{`  ${count}`}</span>
          ) : null}
        </h2>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="flex items-center gap-1 rounded-full bg-tertiary px-3 py-1.5 text-[13px] font-semibold text-primary"
          >
            <Plus className="h-4 w-4" />
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value?: string; href?: string }) {
  const body = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0 text-gray2" />
      <span className="min-w-0 flex-1">
        <span className="caption block">{label}</span>
        <span className={cn("block break-words text-sm font-medium text-ink", href && "text-info")}>{value || "—"}</span>
      </span>
      {href ? <Phone className="h-[18px] w-[18px] shrink-0 fill-info text-info" /> : null}
    </>
  );
  return href ? (
    <a href={href} className="flex items-center gap-3 active:opacity-70">
      {body}
    </a>
  ) : (
    <div className="flex items-center gap-3">{body}</div>
  );
}

function AttachmentThumb({ fileId, onClick }: { fileId?: string; onClick: () => void }) {
  const { url, failed } = useFileUrl(fileId);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open attachment"
      className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-borderlight bg-surface"
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Paperclip className="h-7 w-7 text-gray3" />
      )}
    </button>
  );
}

function ActionChip({
  icon: Icon,
  label,
  onClick,
  href,
  busy,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  busy?: boolean;
  active?: boolean;
}) {
  const className = cn(
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold active:opacity-80 disabled:opacity-60",
    active ? "border-primary bg-primary text-white" : "border-tertiary bg-white text-primary",
  );
  const content = (
    <>
      <Icon className="h-4 w-4" />
      {busy ? "Please wait…" : label}
    </>
  );
  return href ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={busy} className={className}>
      {content}
    </button>
  );
}
