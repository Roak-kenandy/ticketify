'use client';

import Image from 'next/image';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Check, CheckCircle2, Loader2, Lock } from 'lucide-react';

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

function money(value: number | string | undefined, currency: string): string {
  const n = Number(value ?? 0);
  return `${currency} ${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function CheckoutBody() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? '';
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

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
      setError('This payment link is invalid. Please contact Medianet.');
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
      <StatusScreen
        tone="success"
        title="Already paid"
        message={`${money(data.amount_mvr, data.currency)}${
          data.invoice_number ? ` for invoice ${data.invoice_number}` : ''
        } has been received. No further payment is needed.`}
        footnote={data.receipt_number ? `Receipt ${data.receipt_number}` : undefined}
      />
    );
  }

  if (error || !data) {
    return (
      <StatusScreen
        tone="error"
        title="We couldn't open this payment"
        message={`${error ?? 'Payment not found'}. Please check the link you received or contact Medianet.`}
      />
    );
  }

  const subtitle = data.invoice_number
    ? `Service charge — Invoice ${data.invoice_number}`
    : 'Service charge — Medianet';

  return (
    <>
    <BrandBar />
    <main className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <header className="text-center">
        <h1 className="text-[28px] font-bold leading-tight text-slate-900">Payment</h1>
        <p className="mt-1 text-[15px] text-slate-500">{subtitle}</p>
      </header>

      <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-6 text-center">
        <p className="text-[15px] text-slate-500">Amount</p>
        <p className="mt-1 text-[32px] font-bold leading-none tracking-tight text-slate-900">
          {money(data.amount_mvr, data.currency)}
        </p>
      </section>

      <dl className="mt-4 divide-y divide-slate-200 border-b border-slate-200 text-[15px]">
        {data.invoice_number && <Row label="Invoice" value={data.invoice_number} />}
        <Row label="Reference" value={data.reference} mono />
        {data.payment_phone && <Row label="Payer Phone" value={data.payment_phone} />}
        {data.line_items.map((l, i) => (
          <Row
            key={`${l.code ?? 'item'}-${i}`}
            label={`${l.label ?? l.code ?? 'Item'}${(l.quantity ?? 1) > 1 ? ` × ${l.quantity}` : ''}`}
            value={money(l.line_total_mvr, data.currency)}
          />
        ))}
        <Row label="Subtotal" value={money(data.subtotal_mvr, data.currency)} />
        <Row label="GST" value={money(data.tax_mvr, data.currency)} />
      </dl>

      <section className="mt-6">
        <p className="text-[15px] font-medium text-slate-700">Pay with</p>
        <div
          role="radio"
          aria-checked="true"
          className="mt-2 flex items-center gap-3 rounded-xl border-2 border-[#13213f] bg-slate-50 px-4 py-3.5">
          <Image
            src="/images/bml-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 object-contain"
            priority
          />
          <span className="flex-1 text-[15px] font-semibold text-slate-900">
            Bank of Maldives
          </span>
          <span
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#13213f] text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        </div>
      </section>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 px-4 py-4 text-[14px] leading-snug text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#13213f]"
          checked={terms}
          onChange={e => setTerms(e.target.checked)}
        />
        <span>
          I agree to Medianet&apos;s{' '}
          <span className="font-semibold text-[#13213f]">Terms &amp; Conditions</span> and{' '}
          <span className="font-semibold text-[#13213f]">Privacy Policy</span>.
        </span>
      </label>

      {data.status !== 'PENDING' && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          This payment link is no longer active. Ask your technician to send a new one.
        </p>
      )}

      <button
        type="button"
        disabled={!terms || !data.can_pay || redirecting}
        onClick={payNow}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#13213f] px-4 py-3.5 text-[16px] font-semibold text-white transition hover:bg-[#0c1730] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13213f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#13213f]/55">
        {redirecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening Bank of Maldives…
          </>
        ) : (
          'Pay Now'
        )}
      </button>

      <p className="mt-5 text-center text-xs text-slate-400">
        You will be redirected to Bank of Maldives to complete your payment securely.
      </p>
    </main>
    </>
  );
}

function BrandBar() {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-5">
        <span className="flex items-center gap-2.5">
          <MedianetLogo size={36} />
          <span className="text-[17px] font-bold tracking-tight text-[#13213f]">Medianet</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
          <Lock className="h-3.5 w-3.5" />
          Secure payment
        </span>
      </div>
    </header>
  );
}

function MedianetLogo({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/medianet-logo.png"
      alt="Medianet"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd
        className={`text-right font-medium text-slate-900 ${mono ? 'break-all font-mono text-[13px]' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function StatusScreen({
  tone,
  title,
  message,
  footnote,
}: {
  tone: 'success' | 'error';
  title: string;
  message: string;
  footnote?: string;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <>
    <BrandBar />
    <main className="mx-auto flex w-full max-w-md flex-col items-center px-5 pb-10 pt-16 text-center">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${
          tone === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
        }`}>
        <Icon className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-[22px] font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{message}</p>
      {footnote && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
          {footnote}
        </p>
      )}
    </main>
    </>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4"
      role="status">
      <MedianetLogo size={48} className="mx-auto" />
      <Loader2 className="h-5 w-5 animate-spin text-[#13213f]" />
      <p className="text-sm text-slate-500">{label}</p>
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
