'use client';

import Image from 'next/image';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3333/api/v1';

type Summary = {
  reference: string;
  status: string;
  paid?: boolean;
  invoice_number: string | null;
  receipt_number?: string | null;
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

const CHECKOUT_PATH = /\/payments\/public\/TKT-PAY-[A-Za-z0-9_-]{4,64}\/bml$/;

/** Only follow the API's own BML redirect route; never an arbitrary URL from the response. */
function safeCheckoutUrl(raw: string | undefined): string | null {
  try {
    const url = new URL(raw ?? '');
    const allowHttp = process.env.NODE_ENV !== 'production';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowHttp)) {
      return null;
    }
    if (url.username || url.password || !CHECKOUT_PATH.test(url.pathname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

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
    const ref = encodeURIComponent(reference);
    // Ask the bank first so a customer reopening the link after paying sees
    // "Paid" instead of being offered to pay again.
    fetch(`${API_BASE_URL}/payments/public/${ref}/verify`, {
      method: 'POST',
      cache: 'no-store',
    })
      .catch(() => undefined)
      .then(() =>
        fetch(`${API_BASE_URL}/payments/public/${ref}/summary`, {
          cache: 'no-store',
        }),
      )
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.message || 'Could not load payment');
        setData(body);
      })
      .catch(e => setError(e.message || 'Could not load payment'))
      .finally(() => setLoading(false));
  }, [reference]);

  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // Returning via the back button restores the page from cache with the
    // spinner still showing; re-enable the button.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setRedirecting(false);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  function payNow() {
    if (!data?.can_pay || !terms || redirecting) return;
    const target = safeCheckoutUrl(data.bml_checkout_url);
    if (!target) {
      setError("This payment link is invalid. Please contact Medianet.");
      return;
    }
    setRedirecting(true);
    window.location.assign(target);
  }

  if (loading) {
    return <PageLoading label="Loading payment…" />;
  }

  if (data && (data.paid || data.status === 'CONFIRMED')) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Already paid</h1>
          <p className="mt-3 text-sm text-slate-600">
            {data.currency}{' '}
            {data.amount_mvr.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            {data.invoice_number ? ` for invoice ${data.invoice_number}` : ''} has
            been received. No further payment is needed.
          </p>
          {data.receipt_number && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
              Receipt {data.receipt_number}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">
            We couldn&apos;t open this payment
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {error ?? 'Payment not found'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Please check the link you received or contact Medianet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 pb-10 sm:py-10">
      <header className="mb-6 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Lock className="h-3 w-3" />
          Medianet · Secure payment
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
            disabled={!terms || !data.can_pay || redirecting}
            onClick={payNow}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#002244] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
            {redirecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening Bank of Maldives…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Pay {data.currency}{' '}
                {data.amount_mvr.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </>
            )}
          </button>
          {!terms && data.can_pay && (
            <p className="-mt-2 text-center text-xs text-slate-500">
              Tick the box above to continue.
            </p>
          )}

          {data.status !== 'PENDING' && (
            <p className="text-center text-xs text-amber-700">
              This payment link is no longer active. Ask your technician to send
              a new one.
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

export default function PaymentCheckoutPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <CheckoutBody />
    </Suspense>
  );
}
