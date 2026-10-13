"use client";

import * as React from "react";
import moment from "moment";
import { PackageMinus, PackagePlus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField, TableSkeletonRows } from "@/components/app/filter-bar";
import { Pagination, paginate } from "@/components/app/pagination";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { buildQuery } from "@/lib/download";
import {
  formatQuantity,
  SERIAL_STATUS_LABEL,
  type SerialUnitRow,
  type SerialUnitStatus,
  type StockMovementRow,
  type StockSummary,
  type StockTechnician,
} from "@/lib/inventory";
import { IssueStockDialog, ReturnStockDialog } from "./stock-dialogs";

type View = "holdings" | "movements" | "serials";

const SERIAL_BADGE: Record<SerialUnitStatus, "info" | "success" | "secondary" | "destructive"> = {
  WITH_TECHNICIAN: "info",
  CONSUMED: "success",
  RETURNED: "secondary",
  FAULTY: "destructive",
};

export default function TechnicianStockPage() {
  const [technicians, setTechnicians] = React.useState<StockTechnician[]>([]);
  const [technician, setTechnician] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [serialStatus, setSerialStatus] = React.useState("all");
  const [view, setView] = React.useState<View>("holdings");
  const [summary, setSummary] = React.useState<StockSummary | null>(null);
  const [movements, setMovements] = React.useState<StockMovementRow[]>([]);
  const [serials, setSerials] = React.useState<SerialUnitRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [dialog, setDialog] = React.useState<"issue" | "return" | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    axiosInterceptorInstance
      .get<StockTechnician[]>("/inventory/stock/technicians")
      .then((response) => setTechnicians(response.data ?? []))
      .catch(() => setTechnicians([]));
  }, []);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    const technicianIds = technician === "all" ? undefined : technician;
    const request =
      view === "holdings"
        ? axiosInterceptorInstance
            .get<StockSummary>(`/inventory/stock/summary${buildQuery({ technician_ids: technicianIds })}`)
            .then((response) => setSummary(response.data))
        : view === "movements"
          ? axiosInterceptorInstance
              .get<StockMovementRow[]>(
                `/inventory/stock/movements${buildQuery({ technician_ids: technicianIds, search: appliedSearch })}`,
              )
              .then((response) => setMovements(response.data ?? []))
          : axiosInterceptorInstance
              .get<SerialUnitRow[]>(
                `/inventory/stock/serials${buildQuery({
                  technician_ids: technicianIds,
                  search: appliedSearch,
                  status: serialStatus,
                })}`,
              )
              .then((response) => setSerials(response.data ?? []));
    request.catch(() => setError(true)).finally(() => setLoading(false));
  }, [view, technician, appliedSearch, serialStatus]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => setPage(1), [view, technician, appliedSearch, serialStatus]);

  const needle = appliedSearch.toLowerCase();
  const holdings = (summary?.rows ?? []).filter(
    (row) =>
      (row.in_hand !== 0 || row.issued > 0) &&
      (!needle || row.item_name.toLowerCase().includes(needle) || row.item_code.toLowerCase().includes(needle)),
  );
  const rows: unknown[] = view === "holdings" ? holdings : view === "movements" ? movements : serials;
  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(rows, page, pageSize);
  const filtered = technician !== "all" || Boolean(appliedSearch) || serialStatus !== "all";
  const defaultTechnician = technician === "all" ? undefined : technician;

  return (
    <>
      <PageHeader
        title="Technician stock"
        description="Items issued to each technician. Technicians can only record issued items on their tickets; ONTs are tracked by serial number from the store to the customer."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDialog("return")}>
              <PackageMinus className="h-4 w-4" />
              Record return
            </Button>
            <Button onClick={() => setDialog("issue")}>
              <PackagePlus className="h-4 w-4" />
              Issue items
            </Button>
          </div>
        }
      />

      <FilterBar onSubmit={() => setAppliedSearch(search.trim())}>
        <FilterField label="Technician">
          <Select value={technician} onValueChange={setTechnician}>
            <SelectTrigger className="w-56" aria-label="Technician">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All technicians</SelectItem>
              {technicians.map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>
                  {tech.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField
          label={view === "holdings" ? "Item" : view === "serials" ? "Serial number" : "Serial, item or reference"}
          htmlFor="stock-search"
          className="min-w-[220px] flex-1 sm:max-w-xs"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="stock-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={view === "serials" ? "e.g. HWTC1A2B3C4D" : "Search"}
              className="pl-9"
            />
          </div>
        </FilterField>
        {view === "serials" && (
          <FilterField label="Status">
            <Select value={serialStatus} onValueChange={setSerialStatus}>
              <SelectTrigger className="w-44" aria-label="Serial status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(SERIAL_STATUS_LABEL) as SerialUnitStatus[]).map((status) => (
                  <SelectItem key={status} value={status}>
                    {SERIAL_STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4" />
            Apply
          </Button>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTechnician("all");
                setSearch("");
                setAppliedSearch("");
                setSerialStatus("all");
              }}
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </FilterBar>

      <Card className="overflow-hidden">
        <div className="border-b p-3">
          <Tabs<View>
            label="Stock view"
            className="sm:w-auto"
            value={view}
            onValueChange={setView}
            items={[
              { value: "holdings", label: "In hand" },
              { value: "movements", label: "Issues & returns" },
              { value: "serials", label: "Serial tracking" },
            ]}
          />
        </div>

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load technician stock"
            description="The inventory service didn't respond."
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : !loading && rows.length === 0 ? (
          <EmptyState
            variant={filtered ? "no-results" : "empty"}
            title={filtered ? "Nothing matches" : view === "serials" ? "No serialized units yet" : "No stock issued yet"}
            description={
              filtered ? "Try another technician or search." : "Use Issue items to hand stock to a technician."
            }
          />
        ) : (
          <>
            <Table containerClassName="max-h-[calc(100dvh-380px)] min-h-[320px]">
              {view === "holdings" ? (
                <>
                  <TableHeader sticky>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Technician</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Issued</TableHead>
                      <TableHead className="text-right">Used on tickets</TableHead>
                      <TableHead className="text-right">Returned</TableHead>
                      <TableHead className="text-right">In hand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows columns={6} rows={8} />
                    ) : (
                      (pageRows as typeof holdings).map((row) => (
                        <TableRow key={`${row.technician_user_id}-${row.item_id}`}>
                          <TableCell className="whitespace-nowrap font-medium">{row.technician_name}</TableCell>
                          <TableCell className="min-w-[200px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{row.item_name}</span>
                              {row.serialized && <Badge variant="info">Serial</Badge>}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">{row.item_code}</div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {formatQuantity(row.issued, row.uom)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {formatQuantity(row.consumed, row.uom)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {formatQuantity(row.returned_good + row.returned_faulty, row.uom)}
                            {row.returned_faulty > 0 && (
                              <div className="text-[11px] text-destructive">
                                {formatQuantity(row.returned_faulty, row.uom)} faulty
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <Badge variant={row.in_hand < 0 ? "destructive" : row.in_hand > 0 ? "brand" : "secondary"}>
                              {formatQuantity(row.in_hand, row.uom)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </>
              ) : view === "movements" ? (
                <>
                  <TableHeader sticky>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Serial</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Recorded by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows columns={8} rows={8} />
                    ) : (
                      (pageRows as StockMovementRow[]).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {moment(row.created_at).format("DD MMM YYYY, HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.type === "Issue" ? "info" : row.condition === "Faulty" ? "destructive" : "secondary"}>
                              {row.type === "Issue" ? "Issued" : `Returned${row.condition ? ` · ${row.condition.toLowerCase()}` : ""}`}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{row.technician_name}</TableCell>
                          <TableCell className="min-w-[180px]">
                            <div className="font-medium">{row.item_name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">{row.item_code}</div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {formatQuantity(row.quantity, row.uom)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.serial_number ?? "—"}</TableCell>
                          <TableCell className="max-w-[200px] text-muted-foreground">
                            <div className="truncate">{row.reference ?? "—"}</div>
                            {row.notes && <div className="truncate text-[11px]">{row.notes}</div>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{row.performed_by_name}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </>
              ) : (
                <>
                  <TableHeader sticky>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Serial</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Held by / installed on</TableHead>
                      <TableHead>Last issued to</TableHead>
                      <TableHead>Last change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows columns={6} rows={8} />
                    ) : (
                      (pageRows as SerialUnitRow[]).map((row) => (
                        <TableRow key={row.serial_number}>
                          <TableCell className="font-mono text-xs font-medium">{row.serial_number}</TableCell>
                          <TableCell className="min-w-[160px]">{row.item_name}</TableCell>
                          <TableCell>
                            <Badge variant={SERIAL_BADGE[row.status]} dot>
                              {SERIAL_STATUS_LABEL[row.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.status === "WITH_TECHNICIAN"
                              ? row.technician_name
                              : row.status === "CONSUMED"
                                ? `SR ${row.sr_number ?? row.crm_ticket_id ?? "—"}`
                                : "Store"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {row.last_issued_to ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {moment(row.updated_at).format("DD MMM YYYY, HH:mm")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </>
              )}
            </Table>
            <Pagination
              total={rows.length}
              page={current}
              pageCount={pageCount}
              pageSize={pageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              noun="rows"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>

      <IssueStockDialog
        open={dialog === "issue"}
        technicians={technicians}
        defaultTechnician={defaultTechnician}
        onClose={() => setDialog(null)}
        onDone={load}
      />
      <ReturnStockDialog
        open={dialog === "return"}
        technicians={technicians}
        defaultTechnician={defaultTechnician}
        onClose={() => setDialog(null)}
        onDone={load}
      />
    </>
  );
}
