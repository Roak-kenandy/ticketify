"use client";

import * as React from "react";
import Link from "next/link";
import moment from "moment";
import { ArrowRight, CalendarDays, Landmark, Receipt, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { TableSkeletonRows } from "@/components/app/filter-bar";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { formatMvr } from "@/lib/format";

type RecentPayment = {
  invoice_no: string;
  receipt_no: string;
  bml_reference_id: string;
  ticket_no: string;
  amount_paid: string;
  paid_date: string;
  issued_by: string;
};

type FinanceSummary = {
  paid_count: number;
  total_collected: string;
  gst_collected: string;
  net_collected: string;
  month_count: number;
  month_collected: string;
  recent: RecentPayment[];
};

export default function FinanceDashboardPage() {
  const [summary, setSummary] = React.useState<FinanceSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    axiosInterceptorInstance
      .get("/reports/finance/summary")
      .then((response) => setSummary(response.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Finance overview"
        description="Payments received from customers and confirmed by Bank of Maldives."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/finance/reports">
                Paid payments report
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />

      {error ? (
        <Card>
          <EmptyState
            variant="error"
            title="Couldn't load finance totals"
            description="The finance service didn't respond. Try again in a moment."
            action={<Button onClick={load}>Try again</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total collected"
              value={summary ? formatMvr(summary.total_collected) : "—"}
              icon={Wallet}
              tone="brand"
              loading={loading}
              hint={summary ? `${formatMvr(summary.net_collected)} excl. GST` : undefined}
            />
            <StatCard
              label="GST collected"
              value={summary ? formatMvr(summary.gst_collected) : "—"}
              icon={Landmark}
              tone="info"
              loading={loading}
            />
            <StatCard
              label="Collected this month"
              value={summary ? formatMvr(summary.month_collected) : "—"}
              icon={CalendarDays}
              tone="success"
              loading={loading}
              hint={
                summary
                  ? `${summary.month_count} ${summary.month_count === 1 ? "payment" : "payments"}`
                  : undefined
              }
            />
            <StatCard
              label="Paid payments"
              value={summary?.paid_count ?? 0}
              icon={Receipt}
              tone="success"
              loading={loading}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-4">
              <CardTitle>Recent payments received</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/finance/reports">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            {!loading && (summary?.recent.length ?? 0) === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No payments received yet"
                description="Payments appear here once a customer pays and Bank of Maldives confirms it."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Receipt</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="hidden md:table-cell">BML reference</TableHead>
                    <TableHead className="text-right">Amount paid</TableHead>
                    <TableHead className="hidden sm:table-cell">Paid</TableHead>
                    <TableHead className="hidden lg:table-cell">Issued by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableSkeletonRows columns={7} rows={5} />
                  ) : (
                    summary?.recent.map((row, index) => (
                      <TableRow key={`${row.receipt_no || row.invoice_no}-${index}`}>
                        <TableCell className="font-medium">{row.receipt_no || "—"}</TableCell>
                        <TableCell>{row.invoice_no || "—"}</TableCell>
                        <TableCell className="tabular-nums">{row.ticket_no || "—"}</TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {row.bml_reference_id || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMvr(row.amount_paid)}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                          {row.paid_date ? moment(row.paid_date).format("DD MMM YYYY, HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {row.issued_by || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
