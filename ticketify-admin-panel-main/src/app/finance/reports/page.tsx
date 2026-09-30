"use client";

import React from "react";
import moment from "moment";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import axiosInterceptorInstance from "@/lib/axios-interceptor";

type FinanceRow = {
  invoice_no: string;
  bml_reference_id: string;
  ticket_no: string;
  ticket_category: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  product_amount: string;
  issued_date: string;
  issued_by: string;
};

export default function FinanceReportsPage() {
  const [serviceRequestId, setServiceRequestId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [applied, setApplied] = React.useState({
    serviceRequestId: "",
    from: "",
    to: "",
  });
  const [rows, setRows] = React.useState<FinanceRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback((filters: typeof applied) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filters.serviceRequestId) {
      params.set("service_request_id", filters.serviceRequestId);
    }
    if (filters.from) {
      params.set("from", filters.from);
    }
    if (filters.to) {
      params.set("to", filters.to);
    }
    const query = params.toString();
    axiosInterceptorInstance
      .get(`/reports/finance/payments${query ? `?${query}` : ""}`)
      .then((response) => setRows(response.data ?? []))
      .catch(() => setError("Could not load the finance report."))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load(applied);
  }, [applied, load]);

  function applyFilters(event?: React.FormEvent) {
    event?.preventDefault();
    setPage(1);
    setApplied({ serviceRequestId: serviceRequestId.trim(), from, to });
  }

  const filtersActive = Boolean(
    serviceRequestId || from || to || applied.serviceRequestId || applied.from || applied.to,
  );

  function clearFilters() {
    setServiceRequestId("");
    setFrom("");
    setTo("");
    setPage(1);
    setApplied({ serviceRequestId: "", from: "", to: "" });
  }

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const rangeStart = rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, rows.length);

  function downloadExcel() {
    setDownloading(true);
    const params = new URLSearchParams();
    if (applied.serviceRequestId) {
      params.set("service_request_id", applied.serviceRequestId);
    }
    if (applied.from) {
      params.set("from", applied.from);
    }
    if (applied.to) {
      params.set("to", applied.to);
    }
    const query = params.toString();
    axiosInterceptorInstance
      .get(`/reports/finance/payments/export${query ? `?${query}` : ""}`, {
        responseType: "blob",
      })
      .then((response) => {
        const blob = new Blob([response.data], {
          type: "application/vnd.ms-excel",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "finance-payments.xls";
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .catch(() => setError("Could not download the Excel report."))
      .finally(() => setDownloading(false));
  }

  return (
    <div className="flex h-screen flex-col p-6 overflow-hidden space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Reports</h2>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={applyFilters}
      >
        <div className="space-y-2 min-w-[220px] flex-1">
          <Label htmlFor="service-request-id">Service Request No</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="service-request-id"
              value={serviceRequestId}
              onChange={(event) => setServiceRequestId(event.target.value)}
              placeholder="Ticket or SR number"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="from-date">From date</Label>
          <Input
            id="from-date"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to-date">To date</Label>
          <Input
            id="to-date"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <Button type="submit">Search</Button>
        <Button
          type="button"
          variant="outline"
          className="bg-[#E7E7E9] text-foreground hover:bg-[#E7E7E9]/90"
          disabled={!filtersActive}
          onClick={clearFilters}
        >
          Clear filter
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={downloading}
          onClick={downloadExcel}
        >
          <Download className="h-4 w-4 mr-2" />
          {downloading ? "Downloading..." : "Download"}
        </Button>
      </form>

      <Card>
        <Table containerClassName="max-h-[calc(100vh-280px)]">
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow className="hover:bg-background">
              <TableHead className="bg-background">Invoice no</TableHead>
              <TableHead className="bg-background">BML reference id</TableHead>
              <TableHead className="bg-background">Ticket no</TableHead>
              <TableHead className="bg-background">Ticket category</TableHead>
              <TableHead className="bg-background">Customer name</TableHead>
              <TableHead className="bg-background">Customer phone no</TableHead>
              <TableHead className="bg-background">Product name</TableHead>
              <TableHead className="bg-background">Product amount</TableHead>
              <TableHead className="bg-background">Issued date</TableHead>
              <TableHead className="bg-background">Issued by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  Loading report...
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  No payment requests match this search.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((row, index) => (
                <TableRow key={`${row.invoice_no}-${row.product_name}-${index}`}>
                  <TableCell>{row.invoice_no || "—"}</TableCell>
                  <TableCell>{row.bml_reference_id || "—"}</TableCell>
                  <TableCell>{row.ticket_no || "—"}</TableCell>
                  <TableCell>{row.ticket_category || "—"}</TableCell>
                  <TableCell>{row.customer_name || "—"}</TableCell>
                  <TableCell>{row.customer_phone || "—"}</TableCell>
                  <TableCell>{row.product_name || "—"}</TableCell>
                  <TableCell>{row.product_amount || "—"}</TableCell>
                  <TableCell>
                    {row.issued_date
                      ? moment(row.issued_date).format("DD MMM YYYY")
                      : "—"}
                  </TableCell>
                  <TableCell>{row.issued_by || "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "0 records"
              : `Showing ${rangeStart}–${rangeEnd} of ${rows.length}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
