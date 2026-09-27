'use client';

import Image from 'next/image';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3333/api/v1';

type Summary = {
  reference: string;
  status: string;
  invoice_number: string | null;
  subtotal_mvr: number;
  tax_mvr: number;
  amount_mvr: number;
  currency: string;
  payment_phone: string | null;
  line_items: Array<{
    label?: string;
    code?: string;
    quantity?: number;
    line_total_mvr?: string | number;
  }>;
  can_pay: boolean;
  bml_checkout_url: string;
};

function CheckoutBody() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? '';
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reference) {
      setError('Missing payment reference.');
      setLoading(false);
      return;
    }
    fetch(
      `${API_BASE_URL}/payments/public/${encodeURIComponent(reference)}/summary`,
    )
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || 'Could not load payment');
        setData(body);
      })
      .catch(e => setError(e.message || 'Could not load payment'))
      .finally(() => setLoading(false));
  }, [reference]);

  function payNow() {
    if (!data?.can_pay || !terms) return;
    window.location.href = data.bml_checkout_url;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm font-medium text-slate-600">Loading payment…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-center text-sm font-medium text-red-700">
            {error ?? 'Payment not found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-4 py-6 pb-10 sm:py-10">
      <header className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Medianet
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
          Service charge payment
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Review your invoice, then pay securely with Bank of Maldives.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-6 text-center">
          <p className="text-sm font-medium text-slate-600">Total amount due</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
            {data.currency}{' '}
            {data.amount_mvr.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        <div className="space-y-3 border-b border-slate-100 px-5 py-4 text-sm">
          {data.invoice_number && (
            <DetailRow label="Invoice" value={data.invoice_number} />
          )}
          <DetailRow label="Reference" value={data.reference} mono />
          {data.payment_phone && (
            <DetailRow label="Payer phone" value={data.payment_phone} />
          )}
        </div>

        <div className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Charge details
          </p>
          <ul className="space-y-2 text-sm">
            {data.line_items.map((l, i) => (
              <li
                key={`${l.code ?? i}`}
                className="flex items-start justify-between gap-3 text-slate-800">
                <span className="font-medium">
                  {l.label ?? l.code}
                  <span className="font-normal text-slate-500">
                    {' '}
                    × {l.quantity ?? 1}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-slate-900">
                  {l.line_total_mvr} {data.currency}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium text-slate-900">
                {data.subtotal_mvr.toFixed(2)} {data.currency}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax</span>
              <span className="font-medium text-slate-900">
                {data.tax_mvr.toFixed(2)} {data.currency}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pay with
          </p>
          <div className="flex items-center justify-between rounded-xl border-2 border-[#c8102e] bg-white px-4 py-3 shadow-sm ring-1 ring-[#c8102e]/10">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                <Image
                  src="/images/bml-logo.png"
                  alt="Bank of Maldives"
                  width={44}
                  height={44}
                  className="h-full w-full object-contain p-0.5"
                  priority
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  Bank of Maldives
                </p>
                <p className="text-xs text-slate-500">Secure card payment</p>
              </div>
            </div>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c8102e] text-sm font-bold text-white"
              aria-hidden>
              ✓
            </span>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
              checked={terms}
              onChange={e => setTerms(e.target.checked)}
            />
            <span>
              I agree to Medianet&apos;s terms for this service charge payment.
            </span>
          </label>

          <button
            type="button"
            disabled={!terms || !data.can_pay}
            onClick={payNow}
            className="w-full rounded-xl bg-[#003366] px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
            Pay now
          </button>

          {data.status !== 'PENDING' && (
            <p className="text-center text-xs text-amber-700">
              This payment is no longer pending ({data.status}).
            </p>
          )}

          <p className="text-center text-xs text-slate-500">
            You will be redirected to Bank of Maldives to complete payment.
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span
        className={`text-right font-medium text-slate-900 ${mono ? 'break-all font-mono text-xs sm:text-sm' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default function PaymentCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-600">Loading…</p>
        </div>
      }>
      <CheckoutBody />
    </Suspense>
  );
}
