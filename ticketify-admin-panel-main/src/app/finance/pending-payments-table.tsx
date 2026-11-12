"use client";

import * as React from "react";
import moment from "moment";
import { toast } from "sonner";
import { Clock, Loader2, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { TableSkeletonRows } from "@/components/app/filter-bar";
import axiosInterceptorInstance, { apiErrorMessage } from "@/lib/axios-interceptor";
import { formatMvr } from "@/lib/format";
import { can } from "@/lib/permissions";

export type PendingPayment = {
  reference: string;
  invoice_no: string;
  ticket_no: string;
  service_request_id: string;
  customer_name: string;
  customer_phone: string;
  amount: string;
  sent_at: string;
  issued_by: string;
  moved_to_new_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
  next_reminder_at: string | null;
};

/** Unpaid payment links, with a "Send reminder" SMS button (once an hour per payment). */
export function PendingPaymentsTable({
  rows,
  loading,
  onChanged,
}: {
  rows: PendingPayment[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [sending, setSending] = React.useState<string | null>(null);
  const [canRemind, setCanRemind] = React.useState(false);
  React.useEffect(() => setCanRemind(can("finance_overview", "EDIT")), []);
  const [, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function remind(row: PendingPayment) {
    setSending(row.reference);
    try {
      await axiosInterceptorInstance.post(`/reports/finance/pending/${encodeURIComponent(row.reference)}/remind`);
      toast.success(`Reminder sent to ${row.customer_name || "the customer"}`);
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't send the reminder."));
    } finally {
      setSending(null);
    }
  }

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No pending payments"
        description="Every payment link sent to customers has been paid."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Ticket</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden md:table-cell">Link sent</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden lg:table-cell">Issued by</TableHead>
          <TableHead className="text-right">Reminder</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableSkeletonRows columns={7} rows={4} />
        ) : (
          rows.map((row) => {
            const waitUntil = row.next_reminder_at ? new Date(row.next_reminder_at).getTime() : 0;
            const coolingDown = waitUntil > Date.now();
            return (
              <TableRow key={row.reference}>
                <TableCell>
                  <div className="font-medium tabular-nums">{row.ticket_no || "—"}</div>
                  <div className="text-xs text-muted-foreground">{row.invoice_no}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.customer_name || "—"}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">{row.customer_phone}</div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMvr(row.amount)}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                  <div>{moment(row.sent_at).format("DD MMM YYYY, HH:mm")}</div>
                  <div className="text-xs">{moment(row.sent_at).fromNow()}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant="warning" dot>
                      Pending
                    </Badge>
                    {row.moved_to_new_at && (
                      <span className="text-xs text-muted-foreground">Ticket moved back to New</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{row.issued_by || "—"}</TableCell>
                <TableCell className="text-right">
                  {canRemind && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sending !== null || coolingDown}
                    onClick={() => void remind(row)}
                    title={coolingDown ? `Next reminder possible ${moment(waitUntil).fromNow()}` : undefined}
                  >
                    {sending === row.reference ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquareText className="h-4 w-4" />
                    )}
                    {coolingDown ? `Again ${moment(waitUntil).fromNow()}` : "Send reminder"}
                  </Button>
                  )}
                  {row.reminders_sent > 0 && row.last_reminder_at && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.reminders_sent} sent · last {moment(row.last_reminder_at).fromNow()}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
