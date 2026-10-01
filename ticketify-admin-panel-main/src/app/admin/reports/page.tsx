"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import axiosInterceptorInstance, { REPORT_TIMEOUT_MS, apiErrorMessage } from "@/lib/axios-interceptor";
import { buildQuery, downloadFile } from "@/lib/download";
import { cn } from "@/lib/utils";

type MasterRow = {
  open_aging: string;
  closed_aging: string;
  user_id: string;
  ticket_no: string;
  customer_name: string;
  description: string;
  address: string;
  atoll: string;
  island: string;
  email: string;
  mobile: string;
  status: string;
  priority: string;
  team_name: string;
  ticket_type: string;
  current_assignee: string;
  stb_type: string;
  closure_date: string;
  closing_comment: string;
};

type Filters = {
  location: string;
  type: string;
  startDate: string;
  endDate: string;
};

const LOCATIONS = [
  { value: "all", label: "All areas" },
  { value: "male", label: "Malé Access Network" },
  { value: "hulhumale", label: "Hulhumalé Access Network" },
  { value: "transport", label: "Transport Network" },
];

const TYPES = [
  { value: "all", label: "All types" },
  { value: "customer_inquiry", label: "Customer inquiry" },
  { value: "fault", label: "Fault" },
  { value: "new_connection", label: "New connection" },
  { value: "relocation", label: "Relocation" },
  { value: "stb_maintenance", label: "STB maintenance" },
  { value: "closed", label: "Closed" },
];

const COLUMNS: { key: keyof MasterRow; label: string; className?: string }[] = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "open_aging", label: "Open aging" },
  { key: "closed_aging", label: "Closed aging" },
  { key: "customer_name", label: "Customer" },
  { key: "user_id", label: "User ID" },
  { key: "mobile", label: "Mobile" },
  { key: "email", label: "Email" },
  { key: "description", label: "Description", className: "max-w-[260px] truncate" },
  { key: "address", label: "Address", className: "max-w-[200px] truncate" },
  { key: "atoll", label: "Atoll" },
  { key: "island", label: "Island" },
  { key: "team_name", label: "Team" },
  { key: "ticket_type", label: "Category" },
  { key: "current_assignee", label: "Assignee" },
  { key: "stb_type", label: "STB / app" },
  { key: "closure_date", label: "Closed on" },
  { key: "closing_comment", label: "Closing comment", className: "max-w-[260px] truncate" },
];

function isoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function defaultFilters(): Filters {
  const now = new Date();
  return {
    location: "all",
    type: "all",
    startDate: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: isoDate(now),
  };
}

function statusVariant(status: string): BadgeProps["variant"] {
  const value = status.toLowerCase();
  if (/(closed|resolved|complete)/.test(value)) return "success";
  if (/(progress|working|assigned)/.test(value)) return "info";
  if (/(pending|hold|waiting)/.test(value)) return "warning";
  if (/(new|open)/.test(value)) return "brand";
  return "secondary";
}

function priorityVariant(priority: string): BadgeProps["variant"] {
  const value = priority.toLowerCase();
  if (/(critical|urgent|high)/.test(value)) return "destructive";
  if (/medium|normal/.test(value)) return "warning";
  return "secondary";
}

function display(value?: string) {
  return value?.trim() ? value : "—";
}

export default function AdminMasterReportsPage() {
  const [draft, setDraft] = React.useState<Filters>(defaultFilters);
  const [applied, setApplied] = React.useState<Filters>(defaultFilters);
  const [rows, setRows] = React.useState<MasterRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState(false);
  const [quickSearch, setQuickSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const query = React.useMemo(
    () =>
      buildQuery({
        startDate: applied.startDate,
        endDate: applied.endDate,
        location: applied.location,
        type: applied.type,
      }),
    [applied],
  );

  const requestId = React.useRef(0);
  const load = React.useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    axiosInterceptorInstance
      .get(`/reports/master/tickets${query}`, { timeout: REPORT_TIMEOUT_MS })
      .then((response) => {
        if (id === requestId.current) setRows(response.data ?? []);
      })
      .catch((err) => {
        if (id === requestId.current) {
          setRows([]);
          setError(apiErrorMessage(err, "The report service didn't respond."));
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query]);

  React.useEffect(() => {
    load();
  }, [load]);

  const dateError =
    draft.startDate && draft.endDate && draft.startDate > draft.endDate
      ? "Start date must be before the end date."
      : "";

  function apply() {
    if (!draft.startDate || !draft.endDate) {
      toast.error("Choose both a start and end date.");
      return;
    }
    if (dateError) {
      toast.error(dateError);
      return;
    }
    setPage(1);
    setApplied({ ...draft });
  }

  function reset() {
    const next = defaultFilters();
    setDraft(next);
    setApplied(next);
    setQuickSearch("");
    setPage(1);
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadFile(
        `/reports/master/tickets/export${query}`,
        `master-tickets_${applied.startDate}_${applied.endDate}.xls`,
        "application/vnd.ms-excel",
      );
      toast.success("Report downloaded");
    } catch {
      toast.error("Couldn't download the report.");
    } finally {
      setDownloading(false);
    }
  }

  const visibleRows = React.useMemo(() => {
    const needle = quickSearch.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.ticket_no, row.customer_name, row.mobile, row.user_id, row.current_assignee]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [rows, quickSearch]);

  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(
    visibleRows,
    page,
    pageSize,
  );

  const isDefault =
    JSON.stringify(applied) === JSON.stringify(defaultFilters()) && !quickSearch;

  return (
    <>
      <PageHeader
        title="Master report"
        description="Service requests across Malé Access, Hulhumalé Access and the Transport network."
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
        <FilterField label="From" htmlFor="start-date">
          <Input
            id="start-date"
            type="date"
            value={draft.startDate}
            max={draft.endDate || undefined}
            onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))}
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <FilterField label="To" htmlFor="end-date">
          <Input
            id="end-date"
            type="date"
            value={draft.endDate}
            min={draft.startDate || undefined}
            onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <FilterField label="Area">
          <Select
            value={draft.location}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, location: value }))}
          >
            <SelectTrigger className="w-56" aria-label="Area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Ticket type">
          <Select
            value={draft.type}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, type: value }))}
          >
            <SelectTrigger className="w-48" aria-label="Ticket type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4" />
            Apply
          </Button>
          {!isDefault && (
            <Button type="button" variant="ghost" onClick={reset}>
              <X className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>
      </FilterBar>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={quickSearch}
              onChange={(e) => {
                setQuickSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Find ticket, customer or mobile"
              className="h-8 pl-9"
              aria-label="Search within results"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="self-end sm:self-auto"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load the master report"
            description={error}
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : !loading && visibleRows.length === 0 ? (
          <EmptyState
            variant="no-results"
            title={quickSearch ? "Nothing matches that search" : "No tickets in this range"}
            description={
              quickSearch
                ? "Try a different ticket number, name or phone."
                : "Widen the date range or choose a different area or type."
            }
            action={
              !isDefault ? (
                <Button variant="outline" onClick={reset}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table containerClassName="max-h-[calc(100dvh-360px)] min-h-[320px]">
              <TableHeader sticky>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-20 bg-muted">Service request</TableHead>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeletonRows columns={COLUMNS.length + 1} rows={8} />
                ) : (
                  pageRows.map((row, index) => (
                    <TableRow key={`${row.ticket_no}-${index}`} className="group">
                      <TableCell className="sticky left-0 z-[1] bg-card font-medium tabular-nums shadow-[1px_0_0_0_hsl(var(--border))] group-hover:bg-muted">
                        {display(row.ticket_no)}
                      </TableCell>
                      {COLUMNS.map((column) => {
                        const value = row[column.key];
                        if (column.key === "status" && value?.trim()) {
                          return (
                            <TableCell key={column.key}>
                              <Badge variant={statusVariant(value)}>{value}</Badge>
                            </TableCell>
                          );
                        }
                        if (column.key === "priority" && value?.trim()) {
                          return (
                            <TableCell key={column.key}>
                              <Badge variant={priorityVariant(value)}>{value}</Badge>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell
                            key={column.key}
                            title={value || undefined}
                            className={cn(
                              "whitespace-nowrap",
                              !value?.trim() && "text-muted-foreground",
                              column.className,
                            )}
                          >
                            {display(value)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Pagination
              total={visibleRows.length}
              page={current}
              pageCount={pageCount}
              pageSize={pageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              noun="tickets"
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
