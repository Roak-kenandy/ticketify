"use client";

import * as React from "react";
import moment from "moment";
import { toast } from "sonner";
import { Download, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField, TableSkeletonRows } from "@/components/app/filter-bar";
import { Pagination, paginate } from "@/components/app/pagination";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { buildQuery, downloadFile } from "@/lib/download";
import { formatMvr } from "@/lib/format";

type FinanceRow = {
  invoice_no: string;
  receipt_no: string;
  bml_reference_id: string;
  ticket_no: string;
  ticket_category: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  quantity: number;
  product_amount: string;
  gst_amount: string;
  total_amount: string;
  paid_date: string;
  issued_by: string;
};

function toCents(value: string) {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

type Filters = { serviceRequestId: string; from: string; to: string };

const EMPTY: Filters = { serviceRequestId: "", from: "", to: "" };

export default function FinanceReportsPage() {
  const [draft, setDraft] = React.useState<Filters>(EMPTY);
  const [applied, setApplied] = React.useState<Filters>(EMPTY);
  const [rows, setRows] = React.useState<FinanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const query = React.useMemo(
    () =>
      buildQuery({
        service_request_id: applied.serviceRequestId,
        from: applied.from,
        to: applied.to,
      }),
    [applied],
  );

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    axiosInterceptorInstance
      .get(`/reports/finance/payments${query}`)
      .then((response) => setRows(response.data ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [query]);

  React.useEffect(() => {
    load();
  }, [load]);

  const dateError =
    draft.from && draft.to && draft.from > draft.to
      ? "The from date must be before the to date."
      : "";

  function apply() {
    if (dateError) {
      toast.error(dateError);
      return;
    }
    setPage(1);
    setApplied({ ...draft, serviceRequestId: draft.serviceRequestId.trim() });
  }

  function clear() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadFile(
        `/reports/finance/payments/export${query}`,
        "paid-payments.xls",
        "application/vnd.ms-excel",
      );
      toast.success("Report downloaded");
    } catch {
      toast.error("Couldn't download the report.");
    } finally {
      setDownloading(false);
    }
  }

  const filtered = Boolean(applied.serviceRequestId || applied.from || applied.to);
  const totals = {
    paid: rows.reduce((sum, row) => sum + toCents(row.total_amount), 0),
    gst: rows.reduce((sum, row) => sum + toCents(row.gst_amount), 0),
    payments: new Set(
      rows.map((row) => row.receipt_no || row.invoice_no || row.bml_reference_id).filter(Boolean),
    ),
  };
  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(rows, page, pageSize);

  return (
    <>
      <PageHeader
        title="Paid payments"
        description="Items customers have paid for, confirmed by Bank of Maldives. Unpaid, expired and cancelled payment links are not included."
        actions={
          <Button onClick={download} disabled={downloading || loading || rows.length === 0}>
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export to Excel
          </Button>
        }
      />

      <FilterBar onSubmit={apply}>
        <FilterField label="Service request" htmlFor="service-request-id" className="min-w-[220px] flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="service-request-id"
              value={draft.serviceRequestId}
              onChange={(e) => setDraft((prev) => ({ ...prev, serviceRequestId: e.target.value }))}
              placeholder="Ticket, invoice, receipt or BML ref"
              className="pl-9"
            />
          </div>
        </FilterField>
        <FilterField label="Paid from" htmlFor="from-date">
          <Input
            id="from-date"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <FilterField label="Paid to" htmlFor="to-date">
          <Input
            id="to-date"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4" />
            Apply
          </Button>
          {filtered && (
            <Button type="button" variant="ghost" onClick={clear}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </FilterBar>

      <Card className="overflow-hidden">
        {!loading && !error && rows.length > 0 && (
          <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{totals.payments.size}</span>{" "}
              {totals.payments.size === 1 ? "payment" : "payments"} ·{" "}
              <span className="font-medium tabular-nums text-foreground">{rows.length}</span>{" "}
              {rows.length === 1 ? "item" : "items"}
            </span>
            <span className="flex gap-4 text-muted-foreground">
              <span>
                GST{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMvr(totals.gst / 100)}
                </span>
              </span>
              <span>
                Total collected{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMvr(totals.paid / 100)}
                </span>
              </span>
            </span>
          </div>
        )}

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load paid payments"
            description="The finance service didn't respond."
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : !loading && rows.length === 0 ? (
          filtered ? (
            <EmptyState
              variant="no-results"
              title="No paid payments match this search"
              description="Check the number you searched for or widen the paid date range."
              action={
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No payments received yet"
              description="Payments appear here once a customer pays and Bank of Maldives confirms it."
            />
          )
        ) : (
          <>
            <Table containerClassName="max-h-[calc(100dvh-380px)] min-h-[320px]">
              <TableHeader sticky>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Paid</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>BML reference</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total paid</TableHead>
                  <TableHead>Issued by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeletonRows columns={14} rows={8} />
                ) : (
                  pageRows.map((row, index) => (
                    <TableRow key={`${row.receipt_no || row.invoice_no}-${row.product_name}-${index}`}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.paid_date ? moment(row.paid_date).format("DD MMM YYYY, HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{row.receipt_no || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.invoice_no || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.bml_reference_id || "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.ticket_no || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.ticket_category || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.customer_name || "—"}</TableCell>
                      <TableCell className="tabular-nums">{row.customer_phone || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.product_name || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantity ?? 1}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatMvr(row.product_amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {formatMvr(row.gst_amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                        {formatMvr(row.total_amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.issued_by || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Pagination
              total={rows.length}
              page={current}
              pageCount={pageCount}
              pageSize={pageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              noun="items"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
