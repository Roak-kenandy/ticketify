"use client";

import * as React from "react";
import moment from "moment";
import { toast } from "sonner";
import {
  Boxes,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Search,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import {
  FilterBar,
  FilterField,
  TableSkeletonRows,
} from "@/components/app/filter-bar";
import { Pagination, paginate } from "@/components/app/pagination";
import { StatCard } from "@/components/app/stat-card";
import { MultiSelect } from "@/components/app/multi-select";
import axiosInterceptorInstance, {
  apiErrorMessage,
} from "@/lib/axios-interceptor";
import { buildQuery, downloadFile } from "@/lib/download";
import {
  formatQuantity,
  startOfMonthInput,
  type InventoryFilterOptions,
  type InventoryReportRow,
  type InventoryRowStatus,
  type InventorySummary,
} from "@/lib/inventory";

type Filters = {
  from: string;
  to: string;
  technicians: string[];
  items: string[];
  department: string;
  serviceType: string;
  incaAction: string;
  area: string;
  status: string;
  sr: string;
};

const emptyFilters = (): Filters => ({
  from: startOfMonthInput(),
  to: "",
  technicians: [],
  items: [],
  department: "all",
  serviceType: "all",
  incaAction: "all",
  area: "all",
  status: "all",
  sr: "",
});

type View = "detail" | "technician" | "item" | "business";

const STATUS_BADGE: Record<
  InventoryRowStatus,
  "success" | "warning" | "secondary"
> = {
  Posted: "success",
  Adjusted: "warning",
  Reversed: "secondary",
};

type Correction = { row: InventoryReportRow; mode: "reverse" | "adjust" };

export default function InventoryConsumptionPage() {
  const [draft, setDraft] = React.useState<Filters>(emptyFilters);
  const [applied, setApplied] = React.useState<Filters>(emptyFilters);
  const [options, setOptions] = React.useState<InventoryFilterOptions | null>(
    null,
  );
  const [rows, setRows] = React.useState<InventoryReportRow[]>([]);
  const [summary, setSummary] = React.useState<InventorySummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [downloading, setDownloading] = React.useState<"csv" | "xls" | null>(
    null,
  );
  const [view, setView] = React.useState<View>("detail");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [correction, setCorrection] = React.useState<Correction | null>(null);

  const query = React.useMemo(
    () =>
      buildQuery({
        from: applied.from,
        to: applied.to,
        technician_ids: applied.technicians.join(","),
        item_ids: applied.items.join(","),
        department: applied.department,
        service_type: applied.serviceType,
        inca_action: applied.incaAction,
        area: applied.area,
        status: applied.status,
        sr: applied.sr,
      }),
    [applied],
  );

  React.useEffect(() => {
    axiosInterceptorInstance
      .get<InventoryFilterOptions>("/inventory/report/filters")
      .then((response) => setOptions(response.data))
      .catch(() => setOptions(null));
  }, []);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    axiosInterceptorInstance
      .get<{ rows: InventoryReportRow[]; summary: InventorySummary }>(
        `/inventory/report${query}`,
      )
      .then((response) => {
        setRows(response.data.rows ?? []);
        setSummary(response.data.summary ?? null);
      })
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
    setApplied({ ...draft, sr: draft.sr.trim() });
  }

  function clear() {
    const reset = emptyFilters();
    setDraft(reset);
    setApplied(reset);
    setPage(1);
  }

  async function download(format: "csv" | "xls") {
    setDownloading(format);
    try {
      const stamp = moment().format("YYYY-MM-DD");
      await downloadFile(
        `/inventory/report/export${query}${query ? "&" : "?"}format=${format}`,
        `inventory-consumption-${stamp}.${format}`,
        format === "csv" ? "text/csv" : "application/vnd.ms-excel",
      );
      toast.success("Report downloaded");
    } catch {
      toast.error("Couldn't download the report.");
    } finally {
      setDownloading(null);
    }
  }

  const defaults = emptyFilters();
  const filtered =
    applied.from !== defaults.from ||
    Boolean(
      applied.to ||
      applied.sr ||
      applied.technicians.length ||
      applied.items.length,
    ) ||
    [
      applied.department,
      applied.serviceType,
      applied.incaAction,
      applied.area,
      applied.status,
    ].some((value) => value !== "all");
  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(
    rows,
    page,
    pageSize,
  );
  const totals = summary?.totals;

  return (
    <>
      <PageHeader
        title="Inventory consumption"
        description="Materials technicians recorded against service requests. Corrections are kept as adjustments or reversals; nothing is deleted."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => download("csv")}
              disabled={Boolean(downloading) || loading || rows.length === 0}
            >
              {downloading === "csv" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              CSV
            </Button>
            <Button
              onClick={() => download("xls")}
              disabled={Boolean(downloading) || loading || rows.length === 0}
            >
              {downloading === "xls" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Export to Excel
            </Button>
          </div>
        }
      />

      <FilterBar onSubmit={apply}>
        <FilterField label="From" htmlFor="inv-from">
          <Input
            id="inv-from"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, from: e.target.value }))
            }
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <FilterField label="To" htmlFor="inv-to">
          <Input
            id="inv-to"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, to: e.target.value }))
            }
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <FilterField label="Technician" htmlFor="inv-tech">
          <MultiSelect
            id="inv-tech"
            noun="technicians"
            placeholder="All technicians"
            options={(options?.technicians ?? []).map((tech) => ({
              value: tech.id,
              label: tech.name,
            }))}
            value={draft.technicians}
            onChange={(technicians) =>
              setDraft((prev) => ({ ...prev, technicians }))
            }
          />
        </FilterField>
        <FilterField label="Item" htmlFor="inv-item">
          <MultiSelect
            id="inv-item"
            noun="items"
            placeholder="All items"
            options={(options?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
              hint: item.code,
            }))}
            value={draft.items}
            onChange={(items) => setDraft((prev) => ({ ...prev, items }))}
          />
        </FilterField>
        <OptionFilter
          label="Department"
          value={draft.department}
          values={options?.departments ?? []}
          allLabel="All departments"
          onChange={(department) =>
            setDraft((prev) => ({ ...prev, department }))
          }
        />
        <OptionFilter
          label="Service type"
          value={draft.serviceType}
          values={options?.service_types ?? []}
          allLabel="All types"
          onChange={(serviceType) =>
            setDraft((prev) => ({ ...prev, serviceType }))
          }
        />
        <FilterField label="INCA action">
          <Select
            value={draft.incaAction}
            onValueChange={(incaAction) =>
              setDraft((prev) => ({ ...prev, incaAction }))
            }
          >
            <SelectTrigger className="w-40" aria-label="INCA action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any action</SelectItem>
              {(options?.inca_actions ?? []).map((action) => (
                <SelectItem key={action.value} value={action.value}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <OptionFilter
          label="Area"
          value={draft.area}
          values={options?.areas ?? []}
          allLabel="All areas"
          onChange={(area) => setDraft((prev) => ({ ...prev, area }))}
        />
        <FilterField label="Status">
          <Select
            value={draft.status}
            onValueChange={(status) =>
              setDraft((prev) => ({ ...prev, status }))
            }
          >
            <SelectTrigger className="w-36" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="reversed">Reversed</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField
          label="SR ID or serial"
          htmlFor="inv-sr"
          className="min-w-[200px] flex-1 sm:max-w-xs"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="inv-sr"
              value={draft.sr}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, sr: e.target.value }))
              }
              placeholder="e.g. S41374 or ONT serial"
              className="pl-9"
            />
          </div>
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

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Item lines"
          value={totals?.lines ?? 0}
          icon={ClipboardList}
          loading={loading}
        />
        <StatCard
          label="Service requests"
          value={totals?.tickets ?? 0}
          icon={Boxes}
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Technicians"
          value={totals?.technicians ?? 0}
          icon={Users}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Reversed lines"
          value={totals?.reversed ?? 0}
          icon={Undo2}
          tone="neutral"
          hint="Excluded from totals"
          loading={loading}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-3">
          <Tabs<View>
            label="Report view"
            className="sm:w-auto"
            value={view}
            onValueChange={setView}
            items={[
              { value: "detail", label: "Detail", count: rows.length },
              {
                value: "technician",
                label: "By technician",
                count: summary?.by_technician.length,
              },
              {
                value: "item",
                label: "By item",
                count: summary?.by_item.length,
              },
              {
                value: "business",
                label: "By business line",
                count: summary?.by_business_line?.length,
              },
            ]}
          />
        </div>

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load inventory consumption"
            description="The inventory service didn't respond."
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : !loading && rows.length === 0 ? (
          filtered ? (
            <EmptyState
              variant="no-results"
              title="No consumption matches these filters"
              description="Widen the date range or clear some filters."
              action={
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Nothing recorded this period"
              description="Lines appear here as technicians declare the materials they used on a service request."
            />
          )
        ) : view === "detail" ? (
          <>
            <Table containerClassName="max-h-[calc(100dvh-460px)] min-h-[320px]">
              <TableHeader sticky>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>SR</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Service type</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeletonRows columns={11} rows={8} />
                ) : (
                  pageRows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={
                        row.status === "Reversed" ? "opacity-60" : undefined
                      }
                    >
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {moment(row.posted_at).format("DD MMM YYYY, HH:mm")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium tabular-nums">
                        {row.sr_number ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.technician_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.department ?? "—"}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="font-medium">{row.item_name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.item_code}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        <span
                          className={
                            row.status === "Reversed"
                              ? "line-through"
                              : "font-medium"
                          }
                        >
                          {formatQuantity(
                            row.status === "Reversed"
                              ? row.original_quantity
                              : row.quantity,
                            row.uom,
                          )}
                        </span>
                        {row.status === "Adjusted" && (
                          <div className="text-[11px] text-muted-foreground">
                            was {formatQuantity(row.original_quantity, row.uom)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.serial_number ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div>{row.service_type ?? "—"}</div>
                        {row.inca_actions && (
                          <div className="text-[11px] text-muted-foreground">
                            INCA: {row.inca_actions}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.area ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_BADGE[row.status]}
                          title={row.adjustment_note ?? undefined}
                        >
                          {row.status}
                        </Badge>
                        {row.adjustment_note && (
                          <div className="mt-1 max-w-[180px] truncate text-[11px] text-muted-foreground">
                            {row.adjustment_note}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.status !== "Reversed" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Correct ${row.item_name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {!row.serial_number && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setCorrection({ row, mode: "adjust" })
                                  }
                                >
                                  <PencilLine className="h-4 w-4" />
                                  Adjust quantity
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() =>
                                  setCorrection({ row, mode: "reverse" })
                                }
                              >
                                <RotateCcw className="h-4 w-4" />
                                Reverse line
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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
              noun="lines"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        ) : view === "technician" ? (
          <Table containerClassName="max-h-[calc(100dvh-460px)] min-h-[320px]">
            <TableHeader sticky>
              <TableRow className="hover:bg-transparent">
                <TableHead>Technician</TableHead>
                <TableHead className="text-right">Service requests</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead>Items used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeletonRows columns={4} rows={6} />
              ) : (
                summary?.by_technician.map((tech) => (
                  <TableRow key={tech.technician_user_id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {tech.technician_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tech.tickets}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tech.lines}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {tech.items.map((item) => (
                          <Badge
                            key={`${item.item_name}-${item.uom}`}
                            variant="outline"
                            className="font-normal"
                          >
                            {item.item_name}
                            <span className="font-medium tabular-nums">
                              {formatQuantity(item.quantity, item.uom)}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : view === "business" ? (
          <Table containerClassName="max-h-[calc(100dvh-460px)] min-h-[320px]">
            <TableHeader sticky>
              <TableRow className="hover:bg-transparent">
                <TableHead>Department</TableHead>
                <TableHead>Service type</TableHead>
                <TableHead className="text-right">Service requests</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead>Items used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeletonRows columns={5} rows={6} />
              ) : (
                summary?.by_business_line.map((line) => (
                  <TableRow key={`${line.department}-${line.service_type}`}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {line.department}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {line.service_type}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.tickets}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.lines}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {line.items.map((item) => (
                          <Badge
                            key={`${item.item_name}-${item.uom}`}
                            variant="outline"
                            className="font-normal"
                          >
                            {item.item_name}
                            <span className="font-medium tabular-nums">
                              {formatQuantity(item.quantity, item.uom)}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : (
          <Table containerClassName="max-h-[calc(100dvh-460px)] min-h-[320px]">
            <TableHeader sticky>
              <TableRow className="hover:bg-transparent">
                <TableHead>Item</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Total used</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Serials</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeletonRows columns={5} rows={6} />
              ) : (
                summary?.by_item.map((item) => (
                  <TableRow key={item.item_id}>
                    <TableCell className="font-medium">
                      {item.item_name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.item_code}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                      {formatQuantity(item.quantity, item.uom)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.lines}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.serials || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <CorrectionDialog
        correction={correction}
        onClose={() => setCorrection(null)}
        onDone={load}
      />
    </>
  );
}

function OptionFilter({
  label,
  value,
  values,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterField label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-40" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {values.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

function CorrectionDialog({
  correction,
  onClose,
  onDone,
}: {
  correction: Correction | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setQuantity(correction ? String(correction.row.quantity) : "");
    setReason("");
  }, [correction]);

  if (!correction) return null;
  const { row, mode } = correction;
  const reversing = mode === "reverse";
  const parsed = Number(quantity);
  const quantityError =
    !reversing && (!Number.isFinite(parsed) || parsed <= 0)
      ? "Enter a quantity greater than zero."
      : !reversing && parsed === row.quantity
        ? "The new quantity is the same as the current one."
        : "";
  const reasonError =
    reason.trim().length < 3
      ? "Give a short reason (at least 3 characters)."
      : "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (quantityError || reasonError) return;
    setBusy(true);
    try {
      await axiosInterceptorInstance.post(
        `/inventory/consumptions/${row.id}/${reversing ? "reverse" : "adjust"}`,
        reversing
          ? { reason: reason.trim() }
          : { quantity: parsed, reason: reason.trim() },
      );
      toast.success(reversing ? "Line reversed" : "Quantity adjusted");
      onClose();
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save the correction."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {reversing ? "Reverse inventory line" : "Adjust quantity"}
            </DialogTitle>
            <DialogDescription>
              {row.item_name} on {row.sr_number ?? "this service request"} ·{" "}
              {formatQuantity(row.quantity, row.uom)}
              {row.serial_number ? ` · ${row.serial_number}` : ""}. The original
              line stays in the audit trail.
            </DialogDescription>
          </DialogHeader>
          {!reversing && (
            <div className="space-y-1.5">
              <Label htmlFor="adjust-qty">Correct quantity ({row.uom})</Label>
              <Input
                id="adjust-qty"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={Boolean(quantity) && Boolean(quantityError)}
                autoFocus
              />
              {quantity && quantityError && (
                <p className="text-xs text-destructive">{quantityError}</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Input
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                reversing
                  ? "e.g. Item returned to store unused"
                  : "e.g. Physical recount"
              }
              maxLength={500}
              autoFocus={reversing}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={reversing ? "destructive" : "default"}
              disabled={busy || Boolean(quantityError) || Boolean(reasonError)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {reversing ? "Reverse line" : "Save adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
