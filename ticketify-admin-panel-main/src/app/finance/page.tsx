"use client";

import React from "react";
import Link from "next/link";
import moment from "moment";
import { FileText, Receipt, Wallet, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import axiosInterceptorInstance from "@/lib/axios-interceptor";

type RecentPayment = {
  invoice_no: string;
  bml_reference_id: string;
  ticket_no: string;
  product_amount: string;
  issued_date: string;
  issued_by: string;
};

type FinanceSummary = {
  invoices: number;
  payments: number;
  confirmed: number;
  pending: number;
  total_amount: string;
  recent: RecentPayment[];
};

export default function FinanceDashboardPage() {
  const [summary, setSummary] = React.useState<FinanceSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    axiosInterceptorInstance
      .get("/reports/finance/summary")
      .then((response) => setSummary(response.data))
      .catch(() => setError("Could not load the finance dashboard."))
      .finally(() => setLoading(false));
  }, []);

  const cards = summary
    ? [
        {
          label: "Invoices",
          value: String(summary.invoices),
          icon: FileText,
          color: "text-blue-500",
        },
        {
          label: "Total amount (MVR)",
          value: summary.total_amount,
          icon: Wallet,
          color: "text-emerald-500",
        },
        {
          label: "Confirmed payments",
          value: String(summary.confirmed),
          icon: Receipt,
          color: "text-green-600",
        },
        {
          label: "Pending payments",
          value: String(summary.pending),
          icon: Clock,
          color: "text-amber-500",
        },
      ]
    : [];

  return (
    <div className="p-6 space-y-6 overflow-auto">
      <div>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Finance totals for invoices and payment requests
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading &&
          [0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        {!loading &&
          cards.map((card) => (
            <Card key={card.label} className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
                <card.icon className={`h-8 w-8 ${card.color}`} />
              </div>
            </Card>
          ))}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recent payments</h3>
        <Link href="/finance/reports" className="text-sm text-primary underline">
          Open reports
        </Link>
      </div>
      {!loading && summary && summary.recent.length === 0 && (
        <p className="text-sm text-muted-foreground">No payment requests yet.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summary?.recent.map((row, index) => (
          <Card key={`${row.invoice_no}-${index}`} className="p-5 space-y-2">
            <p className="font-semibold">{row.invoice_no || "No invoice"}</p>
            <p className="text-sm text-muted-foreground">
              Ticket no: {row.ticket_no || "—"}
            </p>
            <p className="text-sm">BML reference id: {row.bml_reference_id || "—"}</p>
            <p className="text-sm">Amount: {row.product_amount || "—"} MVR</p>
            <p className="text-sm">
              Issued date:{" "}
              {row.issued_date
                ? moment(row.issued_date).format("DD MMM YYYY")
                : "—"}
            </p>
            <p className="text-sm">Issued by: {row.issued_by || "—"}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
