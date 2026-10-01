'use client';

import { useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Undo2 } from 'lucide-react';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3333/api/v1';

function PaymentReturnBody() {
  const params = useSearchParams();
  const reference =
    params.get('reference') ??
    params.get('ref') ??
    params.get('localId') ??
    '';
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(reference));

  useEffect(() => {
    if (!reference) return;
    fetch(
      `${API_BASE_URL}/payments/public/${encodeURIComponent(reference)}/summary`,
    )
      .then(r => r.json())
      .then(d => setStatus(d.status ?? null))
      .catch(() => setStatus(null))
      .finally(() => setChecking(false));
  }, [reference]);

  if (checking) {
    return <PageLoading label="Checking your payment…" />;
  }

  const paid = status === 'CONFIRMED';
  const checkoutHref = reference
    ? `/payments/checkout?reference=${encodeURIComponent(reference)}`
    : '/payments/checkout';

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${paid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {paid ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : (
            <Undo2 className="h-6 w-6" />
          )}
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          {paid ? 'Payment received' : 'Returned from bank'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {paid ? (
            <>Thank you. Your payment has been recorded with Medianet.</>
          ) : (
            <>
              If you did not finish paying, continue checkout and tap Pay now
              again.
            </>
          )}
        </p>
        {reference && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 break-all">
            Ref: {reference}
          </p>
        )}
        {reference && !paid && (
          <a
            href={checkoutHref}
            className="mt-6 inline-block w-full rounded-xl bg-[#003366] px-4 py-3 text-sm font-semibold text-white hover:bg-[#002244] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366] focus-visible:ring-offset-2">
            Continue to payment
          </a>
        )}
        <p className="mt-6 text-xs text-slate-500">
          Your technician will confirm in Ticketify once the bank confirms
          payment.
        </p>
      </div>
    </div>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4"
      role="status">
      <Loader2 className="h-6 w-6 animate-spin text-[#003366]" />
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <PaymentReturnBody />
    </Suspense>
  );
}
