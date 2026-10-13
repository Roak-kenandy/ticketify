"use client";

import * as React from "react";
import moment from "moment";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Download, FileSpreadsheet, Loader2, PackageCheck, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField, TableSkeletonRows } from "@/components/app/filter-bar";
import { StatCard } from "@/components/app/stat-card";
import { MultiSelect } from "@/components/app/multi-select";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { buildQuery, downloadFile } from "@/lib/download";
import {
  formatQuantity,
  startOfMonthInput,
  type InventoryItem,
  type StockSummary,
  type StockTechnician,
} from "@/lib/inventory";

type Filters = { from: string; to: string; technicians: string[]; items: string[] };
type View = "technician" | "item";

const emptyFilters = (): Filters => ({ from: startOfMonthInput(), to: "", technicians: [], items: [] });

export default function StockReportPage() {
  const [draft, setDraft] = React.useState<Filters>(emptyFilters);
  const [applied, setApplied] = React.useState<Filters>(emptyFilters);
  const [technicians, setTechnicians] = React.useState<StockTechnician[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [summary, setSummary] = React.useState<StockSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [view, setView] = React.useState<View>("technician");
  const [downloading, setDownloading] = React.useState<string | null>(null);

  React.useEffect(() => {
    axiosInterceptorInstance
      .get<StockTechnician[]>("/inventory/stock/technicians")
      .then((response) => setTechnicians(response.data ?? []))
      .catch(() => setTechnicians([]));
    axiosInterceptorInstance
      .get<InventoryItem[]>("/inventory/items?include_inactive=true")
      .then((response) => setItems(response.data ?? []))
      .catch(() => setItems([]));
  }, []);

  const query = React.useMemo(
    () =>
      buildQuery({
        from: applied.from,
        to: applied.to,
        technician_ids: applied.technicians.join(","),
        item_ids: applied.items.join(","),
      }),
    [applied],
  );

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    axiosInterceptorInstance
      .get<StockSummary>(`/inventory/stock/summary${query}`)
      .then((response) => setSummary(response.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [query]);

  React.useEffect(() => {
    load();
  }, [load]);

  const dateError = draft.from && draft.to && draft.from > draft.to ? "The from date must be before the to date." : "";

  async function download(kind: "summary" | "movements", format: "csv" | "xls") {
    setDownloading(`${kind}-${format}`);
    try {
      const stamp = moment().format("YYYY-MM-DD");
      const base = kind === "summary" ? "technician-stock" : "stock-issues-returns";
      await downloadFile(
        `/inventory/stock/${kind}/export${query}${query ? "&" : "?"}format=${format}`,
        `${base}-${stamp}.${format}`,
        format === "csv" ? "text/csv" : "application/vnd.ms-excel",
      );
      toast.success("Report downloaded");
    } catch {
      toast.error("Couldn't download the report.");
    } finally {
      setDownloading(null);
    }
  }

  const rows = summary?.rows ?? [];
  const byItem = summary?.by_item ?? [];
  const defaults = emptyFilters();
  const filtered =
    applied.from !== defaults.from || Boolean(applied.to || applied.technicians.length || applied.items.length);
  const periodLabel = applied.from
    ? `${moment(applied.from).format("DD MMM YYYY")} – ${applied.to ? moment(applied.to).format("DD MMM YYYY") : "today"}`
    : "All time";

  return (
    <>
      <PageHeader
        title="Stock report"
        description="What the inventory team issued, what technicians used on tickets, what came back and what each technician still holds."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => download("movements", "xls")}
              disabled={Boolean(downloading)}
            >
              {downloading === "movements-xls" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Issues &amp; returns
            </Button>
            <Button
              variant="outline"
              onClick={() => download("summary", "csv")}
              disabled={Boolean(downloading) || loading || rows.length === 0}
            >
              {downloading === "summary-csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              CSV
            </Button>
            <Button
              onClick={() => download("summary", "xls")}
              disabled={Boolean(downloading) || loading || rows.length === 0}
            >
              {downloading === "summary-xls" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Export to Excel
            </Button>
          </div>
        }
      />

      <FilterBar
        onSubmit={() => {
          if (dateError) {
            toast.error(dateError);
            return;
          }
          setApplied(draft);
        }}
      >
        <FilterField label="From" htmlFor="stock-from">
          <Input
            id="stock-from"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <FilterField label="To" htmlFor="stock-to">
          <Input
            id="stock-to"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
            className="w-40"
            aria-invalid={Boolean(dateError)}
          />
        </FilterField>
        <FilterField label="Technician" htmlFor="stock-techs">
          <MultiSelect
            id="stock-techs"
            noun="technicians"
            placeholder="All technicians"
            options={technicians.map((tech) => ({ value: tech.id, label: tech.name }))}
            value={draft.technicians}
            onChange={(selected) => setDraft((prev) => ({ ...prev, technicians: selected }))}
          />
        </FilterField>
        <FilterField label="Item" htmlFor="stock-items">
          <MultiSelect
            id="stock-items"
            noun="items"
            placeholder="All items"
            options={items.map((item) => ({ value: item.id, label: item.name, hint: item.code }))}
            value={draft.items}
            onChange={(selected) => setDraft((prev) => ({ ...prev, items: selected }))}
          />
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4" />
            Apply
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDraft((prev) => ({ ...prev, from: "", to: "" }))}>
            All time
          </Button>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const reset = emptyFilters();
                setDraft(reset);
                setApplied(reset);
              }}
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </FilterBar>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Technicians in report" value={summary?.totals.technicians ?? 0} icon={Users} loading={loading} />
        <StatCard
          label="Holding stock now"
          value={summary?.totals.technicians_holding ?? 0}
          icon={PackageCheck}
          tone="info"
          loading={loading}
        />
        <StatCard label="Items" value={summary?.totals.items ?? 0} icon={Boxes} tone="success" loading={loading} />
        <StatCard
          label="Over-used lines"
          value={summary?.totals.overdrawn ?? 0}
          icon={AlertTriangle}
          tone={summary?.totals.overdrawn ? "danger" : "neutral"}
          hint="In hand below zero after a correction"
          loading={loading}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <Tabs<View>
            label="Report view"
            className="sm:w-auto"
            value={view}
            onValueChange={setView}
            items={[
              { value: "technician", label: "By technician", count: rows.length },
              { value: "item", label: "By item", count: byItem.length },
            ]}
          />
          <span className="text-xs text-muted-foreground">
            Issued, used and returned: {periodLabel}. In hand: right now.
          </span>
        </div>

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load the stock report"
            description="The inventory service didn't respond."
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : !loading && rows.length === 0 ? (
          <EmptyState
            variant={filtered ? "no-results" : "empty"}
            title={filtered ? "Nothing in this period" : "No stock movements yet"}
            description={filtered ? "Widen the dates or clear some filters." : "Issue items to technicians to start the report."}
          />
        ) : (
          <Table containerClassName="max-h-[calc(100dvh-480px)] min-h-[320px]">
            <TableHeader sticky>
              <TableRow className="hover:bg-transparent">
                {view === "technician" && <TableHead>Technician</TableHead>}
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Used on tickets</TableHead>
                <TableHead className="text-right">Returned good</TableHead>
                <TableHead className="text-right">Returned faulty</TableHead>
                <TableHead className="text-right">In hand now</TableHead>
                {view === "item" && <TableHead className="text-right">Technicians holding</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeletonRows columns={7} rows={8} />
              ) : (
                (view === "technician" ? rows : byItem).map((row) => (
                  <TableRow key={"technician_user_id" in row ? `${row.technician_user_id}-${row.item_id}` : row.item_id}>
                    {"technician_name" in row && (
                      <TableCell className="whitespace-nowrap font-medium">{row.technician_name}</TableCell>
                    )}
                    <TableCell className="min-w-[200px]">
                      <div className="font-medium">{row.item_name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{row.item_code}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatQuantity(row.issued, row.uom)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatQuantity(row.consumed, row.uom)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatQuantity(row.returned_good, row.uom)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {row.returned_faulty ? (
                        <span className="text-destructive">{formatQuantity(row.returned_faulty, row.uom)}</span>
                      ) : (
                        formatQuantity(0, row.uom)
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Badge variant={row.in_hand < 0 ? "destructive" : row.in_hand > 0 ? "brand" : "secondary"}>
                        {formatQuantity(row.in_hand, row.uom)}
                      </Badge>
                    </TableCell>
                    {"technicians" in row && (
                      <TableCell className="text-right tabular-nums">{row.technicians}</TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
