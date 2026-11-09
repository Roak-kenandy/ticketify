"use client";

import * as React from "react";
import moment from "moment";
import Link from "next/link";
import { toast } from "sonner";
import { PackageMinus, PackagePlus, ScanLine, Search, X } from "lucide-react";
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
import axiosInterceptorInstance, { apiErrorMessage } from "@/lib/axios-interceptor";
import { AdminAuth } from "@/lib/admin-auth";
import { buildQuery } from "@/lib/download";
import {
  formatQuantity,
  SERIAL_STATUS_LABEL,
  type SerialUnitRow,
  type SerialUnitStatus,
  type StockMovementRow,
  type StockRequest,
  type StockSummary,
  type StockTechnician,
} from "@/lib/inventory";
import { IssueStockDialog, ReturnStockDialog } from "./stock-dialogs";

type View = "requests" | "holdings" | "movements" | "serials";

const REQUEST_BADGE: Record<StockRequest["status"], "warning" | "success" | "secondary"> = {
  OPEN: "warning",
  FULFILLED: "success",
  CANCELLED: "secondary",
};

function movementLabel(row: StockMovementRow) {
  const store = row.counterparty_name === "Store";
  if (row.type === "Issue") return store ? "Issued from store" : "Handed out";
  if (!store) return "Given back to supervisor";
  return row.condition === "Faulty" ? "Returned · faulty" : "Returned to store";
}

const SERIAL_BADGE: Record<SerialUnitStatus, "info" | "success" | "secondary" | "destructive" | "brand"> = {
  WITH_SUPERVISOR: "brand",
  WITH_TECHNICIAN: "info",
  CONSUMED: "success",
  RETURNED: "secondary",
  FAULTY: "destructive",
};

export default function TechnicianStockPage() {
  const [store, setStore] = React.useState(false);
  const [supervisor, setSupervisor] = React.useState(false);
  const [technicians, setTechnicians] = React.useState<StockTechnician[]>([]);
  const [technician, setTechnician] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [serialStatus, setSerialStatus] = React.useState("all");
  const [view, setView] = React.useState<View>("holdings");
  const [summary, setSummary] = React.useState<StockSummary | null>(null);
  const [movements, setMovements] = React.useState<StockMovementRow[]>([]);
  const [serials, setSerials] = React.useState<SerialUnitRow[]>([]);
  const [requests, setRequests] = React.useState<StockRequest[]>([]);
  const [openRequests, setOpenRequests] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [dialog, setDialog] = React.useState<"issue" | "return" | null>(null);
  const [fulfilling, setFulfilling] = React.useState<StockRequest | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    setStore(AdminAuth.canManageStore());
    setSupervisor(AdminAuth.isSupervisor());
    axiosInterceptorInstance
      .get<StockTechnician[]>("/inventory/stock/technicians")
      .then((response) => setTechnicians(response.data ?? []))
      .catch(() => setTechnicians([]));
  }, []);

  const canSeeRequests = store || supervisor;
  const kindOf = React.useMemo(() => new Map(technicians.map((holder) => [holder.id, holder.kind])), [technicians]);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    const technicianIds = technician === "all" ? undefined : technician;
    const request =
      view === "requests"
        ? axiosInterceptorInstance
            .get<StockRequest[]>("/inventory/stock/requests")
            .then((response) => setRequests(response.data ?? []))
        : view === "holdings"
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

  const loadOpenCount = React.useCallback(() => {
    if (!canSeeRequests) return;
    axiosInterceptorInstance
      .get<StockRequest[]>("/inventory/stock/requests?status=OPEN")
      .then((response) => setOpenRequests(response.data?.length ?? 0))
      .catch(() => undefined);
  }, [canSeeRequests]);

  React.useEffect(() => {
    loadOpenCount();
  }, [loadOpenCount]);

  React.useEffect(() => setPage(1), [view, technician, appliedSearch, serialStatus]);

  const refresh = () => {
    load();
    loadOpenCount();
  };

  async function cancelRequest(request: StockRequest) {
    try {
      await axiosInterceptorInstance.post(`/inventory/stock/requests/${request.id}/cancel`, {});
      toast.success("Request cancelled");
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't cancel the request."));
    }
  }

  const needle = appliedSearch.toLowerCase();
  const holdings = (summary?.rows ?? []).filter(
    (row) =>
      (row.in_hand !== 0 || row.issued > 0) &&
      (!needle || row.item_name.toLowerCase().includes(needle) || row.item_code.toLowerCase().includes(needle)),
  );
  const shownRequests = requests.filter(
    (request) =>
      (technician === "all" || request.requested_by_user_id === technician) &&
      (!needle || request.lines.some((line) => line.item_name.toLowerCase().includes(needle))),
  );
  const rows: unknown[] =
    view === "requests" ? shownRequests : view === "holdings" ? holdings : view === "movements" ? movements : serials;
  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(rows, page, pageSize);
  const filtered = technician !== "all" || Boolean(appliedSearch) || serialStatus !== "all";
  const defaultTechnician = technician === "all" ? undefined : technician;

  return (
    <>
      <PageHeader
        title="Stock"
        description="The store issues stock to supervisors, and supervisors hand it to their technicians. Technicians can only record what they were handed; every ONT is tracked by serial number from the store to the customer."
        actions={
          store ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog("return")}>
                <PackageMinus className="h-4 w-4" />
                Record return
              </Button>
              <Button onClick={() => setDialog("issue")}>
                <PackagePlus className="h-4 w-4" />
                Issue to supervisor
              </Button>
            </div>
          ) : supervisor ? (
            <Button asChild>
              <Link href="/field/stock">
                <ScanLine className="h-4 w-4" />
                Hand out to technicians
              </Link>
            </Button>
          ) : null
        }
      />

      <FilterBar onSubmit={() => setAppliedSearch(search.trim())}>
        <FilterField label={view === "requests" ? "Supervisor" : "Holder"}>
          <Select value={technician} onValueChange={setTechnician}>
            <SelectTrigger className="w-56" aria-label="Holder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {technicians
                .filter((holder) => view !== "requests" || holder.kind === "SUPERVISOR")
                .map((holder) => (
                  <SelectItem key={holder.id} value={holder.id}>
                    {holder.name}
                    {holder.kind === "SUPERVISOR" ? " · Supervisor" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField
          label={
            view === "holdings" || view === "requests"
              ? "Item"
              : view === "serials"
                ? "Serial number"
                : "Serial, item or reference"
          }
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
              ...(canSeeRequests
                ? [{ value: "requests" as const, label: openRequests ? `Requests (${openRequests})` : "Requests" }]
                : []),
              { value: "holdings", label: "In hand" },
              { value: "movements", label: "Issues & returns" },
              { value: "serials", label: "Serial tracking" },
            ]}
          />
        </div>

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load stock"
            description="The inventory service didn't respond."
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : !loading && rows.length === 0 ? (
          <EmptyState
            variant={filtered ? "no-results" : "empty"}
            title={
              filtered
                ? "Nothing matches"
                : view === "requests"
                  ? "No stock requests"
                  : view === "serials"
                    ? "No serialized units yet"
                    : "No stock issued yet"
            }
            description={
              filtered
                ? "Try another holder or search."
                : view === "requests"
                  ? "Supervisors request stock from the Technician app when they run low."
                  : "Use Issue to supervisor to hand stock out of the store."
            }
          />
        ) : (
          <>
            <Table containerClassName="max-h-[calc(100dvh-380px)] min-h-[320px]">
              {view === "requests" ? (
                <>
                  <TableHeader sticky>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Requested</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows columns={5} rows={6} />
                    ) : (
                      (pageRows as StockRequest[]).map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {moment(request.created_at).format("DD MMM YYYY, HH:mm")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{request.requested_by_name}</TableCell>
                          <TableCell className="min-w-[240px]">
                            {request.lines.map((line) => (
                              <div key={line.item_id} className="text-sm">
                                <span className="font-medium">{line.item_name}</span> ×{" "}
                                {formatQuantity(line.quantity, line.uom)}
                                {line.in_hand !== null && (
                                  <span className="text-xs text-muted-foreground">
                                    {" "}
                                    · holds {formatQuantity(line.in_hand, line.uom)}
                                  </span>
                                )}
                              </div>
                            ))}
                            {request.notes && <div className="text-xs text-muted-foreground">“{request.notes}”</div>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant={REQUEST_BADGE[request.status]} dot>
                              {request.status === "OPEN"
                                ? "Waiting"
                                : request.status === "FULFILLED"
                                  ? "Issued"
                                  : "Cancelled"}
                            </Badge>
                            {request.closed_by_name && (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {request.closed_by_name}
                                {request.closed_at ? ` · ${moment(request.closed_at).format("DD MMM, HH:mm")}` : ""}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {request.status === "OPEN" && (
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => cancelRequest(request)}>
                                  {store ? "Decline" : "Cancel"}
                                </Button>
                                {store && (
                                  <Button size="sm" onClick={() => setFulfilling(request)}>
                                    <PackagePlus className="h-4 w-4" />
                                    Issue
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </>
              ) : view === "holdings" ? (
                <>
                  <TableHeader sticky>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Holder</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Handed out</TableHead>
                      <TableHead className="text-right">Used on tickets</TableHead>
                      <TableHead className="text-right">Returned</TableHead>
                      <TableHead className="text-right">In hand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows columns={7} rows={8} />
                    ) : (
                      (pageRows as typeof holdings).map((row) => {
                        const isSupervisor = kindOf.get(row.technician_user_id) === "SUPERVISOR";
                        return (
                          <TableRow key={`${row.technician_user_id}-${row.item_id}`}>
                            <TableCell className="whitespace-nowrap font-medium">
                              {row.technician_name}
                              {isSupervisor && (
                                <Badge variant="brand" className="ml-2">
                                  Supervisor
                                </Badge>
                              )}
                            </TableCell>
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
                              {row.handed_out || row.taken_back ? (
                                <>
                                  {formatQuantity(row.handed_out, row.uom)}
                                  {row.taken_back > 0 && (
                                    <div className="text-[11px] text-muted-foreground">
                                      {formatQuantity(row.taken_back, row.uom)} given back
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
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
                        );
                      })
                    )}
                  </TableBody>
                </>
              ) : view === "movements" ? (
                <>
                  <TableHeader sticky>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Holder</TableHead>
                      <TableHead>From / to</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Serial</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Recorded by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows columns={9} rows={8} />
                    ) : (
                      (pageRows as StockMovementRow[]).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {moment(row.created_at).format("DD MMM YYYY, HH:mm")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge
                              variant={
                                row.type === "Issue" ? "info" : row.condition === "Faulty" ? "destructive" : "secondary"
                              }
                            >
                              {movementLabel(row)}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{row.technician_name}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{row.counterparty_name}</TableCell>
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
                            {row.status === "WITH_TECHNICIAN" || row.status === "WITH_SUPERVISOR"
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
        open={dialog === "issue" || Boolean(fulfilling)}
        technicians={technicians}
        defaultTechnician={defaultTechnician}
        request={fulfilling}
        onClose={() => {
          setDialog(null);
          setFulfilling(null);
        }}
        onDone={refresh}
      />
      <ReturnStockDialog
        open={dialog === "return"}
        technicians={technicians}
        defaultTechnician={defaultTechnician}
        onClose={() => setDialog(null)}
        onDone={refresh}
      />
    </>
  );
}
