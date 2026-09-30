"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
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
import { AdminAuth } from "@/lib/admin-auth";

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

const locations = [
  { value: "all", label: "All areas" },
  { value: "male", label: "Male Access Network" },
  { value: "hulhumale", label: "Hulhumale Access Network" },
  { value: "transport", label: "Transport Network" },
];

const types = [
  { value: "all", label: "All types" },
  { value: "customer_inquiry", label: "Customer Inquiry" },
  { value: "fault", label: "Fault" },
  { value: "new_connection", label: "New Connections" },
  { value: "relocation", label: "Relocation" },
  { value: "stb_maintenance", label: "STB Maintenance" },
  { value: "closed", label: "Closed" },
];

function cell(value?: string) {
  return value?.trim() ? value : "—";
}

export default function AdminMasterReportsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = React.useState(false);
  const [location, setLocation] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [applied, setApplied] = React.useState({
    location: "all",
    type: "all",
    startDate: "",
    endDate: "",
  });
  const [rows, setRows] = React.useState<MasterRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!AdminAuth.canAccessReports()) {
      router.replace("/admin");
      return;
    }
    setAllowed(true);
  }, [router]);

  const load = React.useCallback((filters: typeof applied) => {
    if (!filters.startDate || !filters.endDate) {
      setRows([]);
      setError("Start date and end date are required");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("startDate", filters.startDate);
    params.set("endDate", filters.endDate);
    if (filters.location && filters.location !== "all") {
      params.set("location", filters.location);
    }
    if (filters.type && filters.type !== "all") {
      params.set("type", filters.type);
    }
    axiosInterceptorInstance
      .get(`/reports/master/tickets?${params.toString()}`)
      .then((response) => setRows(response.data ?? []))
      .catch(() => setError("Could not load the master report."))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!allowed || !applied.startDate || !applied.endDate) {
      return;
    }
    load(applied);
  }, [allowed, applied, load]);

  function applyFilters(event?: React.FormEvent) {
    event?.preventDefault();
    if (!startDate || !endDate) {
      setRows([]);
      setError("Start date and end date are required");
      return;
    }
    setPage(1);
    setApplied({
      location,
      type,
      startDate,
      endDate,
    });
  }

  function clearFilters() {
    setLocation("all");
    setType("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
    setRows([]);
    setError("");
    setApplied({
      location: "all",
      type: "all",
      startDate: "",
      endDate: "",
    });
  }

  function downloadExcel() {
    if (!applied.startDate || !applied.endDate) {
      setError("Start date and end date are required");
      return;
    }
    setDownloading(true);
    const params = new URLSearchParams();
    params.set("startDate", applied.startDate);
    params.set("endDate", applied.endDate);
    if (applied.location && applied.location !== "all") {
      params.set("location", applied.location);
    }
    if (applied.type && applied.type !== "all") {
      params.set("type", applied.type);
    }
    axiosInterceptorInstance
      .get(`/reports/master/tickets/export?${params.toString()}`, {
        responseType: "blob",
      })
      .then((response) => {
        const blob = new Blob([response.data], {
          type: "application/vnd.ms-excel",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "master-tickets.xls";
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .catch(() => setError("Could not download the master report."))
      .finally(() => setDownloading(false));
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
  const filtersActive =
    location !== "all" ||
    type !== "all" ||
    startDate.length > 0 ||
    endDate.length > 0;

  if (!allowed) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Master reports</h2>
        <p className="text-sm text-muted-foreground">
          Tickets across Male Access, Hulhumale Access, and Transport Network
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <form className="flex flex-wrap items-end gap-3" onSubmit={applyFilters}>
        <div className="space-y-2">
          <Label htmlFor="start-date">Start date</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End date</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <div className="space-y-2 w-64">
          <Label htmlFor="location">Location</Label>
          <select
            id="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {locations.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 w-56">
          <Label htmlFor="ticket-type">Ticket type</Label>
          <select
            id="ticket-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {types.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
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
        <Table containerClassName="max-h-[calc(100vh-320px)]">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-background">
              <TableHead className="bg-background">Open aging</TableHead>
              <TableHead className="bg-background">Closed aging</TableHead>
              <TableHead className="bg-background">User ID</TableHead>
              <TableHead className="bg-background">Service request</TableHead>
              <TableHead className="bg-background">Name</TableHead>
              <TableHead className="bg-background">Description</TableHead>
              <TableHead className="bg-background">Address</TableHead>
              <TableHead className="bg-background">Atoll</TableHead>
              <TableHead className="bg-background">Island</TableHead>
              <TableHead className="bg-background">Email</TableHead>
              <TableHead className="bg-background">Mobile</TableHead>
              <TableHead className="bg-background">Status</TableHead>
              <TableHead className="bg-background">Priority</TableHead>
              <TableHead className="bg-background">Team</TableHead>
              <TableHead className="bg-background">Service request category</TableHead>
              <TableHead className="bg-background">Current assigned user</TableHead>
              <TableHead className="bg-background">STB type / app</TableHead>
              <TableHead className="bg-background">Closure date</TableHead>
              <TableHead className="bg-background">Closing comment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={19} className="text-muted-foreground">
                  Loading tickets...
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={19} className="text-muted-foreground">
                  No tickets match these filters.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((row) => (
                <TableRow key={`${row.ticket_no}-${row.open_aging}`}>
                  <TableCell>{cell(row.open_aging)}</TableCell>
                  <TableCell>{cell(row.closed_aging)}</TableCell>
                  <TableCell>{cell(row.user_id)}</TableCell>
                  <TableCell>{cell(row.ticket_no)}</TableCell>
                  <TableCell>{cell(row.customer_name)}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {cell(row.description)}
                  </TableCell>
                  <TableCell>{cell(row.address)}</TableCell>
                  <TableCell>{cell(row.atoll)}</TableCell>
                  <TableCell>{cell(row.island)}</TableCell>
                  <TableCell>{cell(row.email)}</TableCell>
                  <TableCell>{cell(row.mobile)}</TableCell>
                  <TableCell>{cell(row.status)}</TableCell>
                  <TableCell>{cell(row.priority)}</TableCell>
                  <TableCell>{cell(row.team_name)}</TableCell>
                  <TableCell>{cell(row.ticket_type)}</TableCell>
                  <TableCell>{cell(row.current_assignee)}</TableCell>
                  <TableCell>{cell(row.stb_type)}</TableCell>
                  <TableCell>{cell(row.closure_date)}</TableCell>
                  <TableCell>{cell(row.closing_comment)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "0 tickets"
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
