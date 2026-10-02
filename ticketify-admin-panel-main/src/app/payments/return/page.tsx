'use client';

import { useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3333/api/v1';

/** Bank confirmations can lag the redirect; keep checking for ~90s before handing off. */
const POLL_DELAYS_MS = [0, 2000, 3000, 4000, 5000, 7000, 10000, 12000, 15000, 15000, 15000];

type VerifyResult = {
  reference: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';
  paid: boolean;
  final: boolean;
  invoice_number: string | null;
  receipt_number: string | null;
  amount_mvr: number;
  currency: string;
};

type ViewState =
  | { kind: 'checking' }
  | { kind: 'result'; data: VerifyResult; stillChecking: boolean }
  | { kind: 'error'; message: string };

async function verify(reference: string, signal: AbortSignal): Promise<VerifyResult> {
  const res = await fetch(
    `${API_BASE_URL}/payments/public/${encodeURIComponent(reference)}/verify`,
    { method: 'POST', cache: 'no-store', signal },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(body?.message || 'Could not check payment'), {
      status: res.status,
    });
  }
  return body as VerifyResult;
}

function PaymentReturnBody() {
  const params = useSearchParams();
  // Only the reference is read from the URL. Bank-supplied query values such as
  // `state` are ignored; the result always comes from our server asking BML.
  const reference = params.get('reference') ?? params.get('localId') ?? '';
  const [view, setView] = useState<ViewState>(
    reference ? { kind: 'checking' } : { kind: 'error', message: 'Missing payment reference.' },
  );
  const runRef = useRef(0);

  const run = useCallback(async () => {
    if (!reference) return;
    const runId = ++runRef.current;
    const controller = new AbortController();
    let last: VerifyResult | null = null;

    for (let i = 0; i < POLL_DELAYS_MS.length; i++) {
      if (POLL_DELAYS_MS[i]) {
        await new Promise(resolve => setTimeout(resolve, POLL_DELAYS_MS[i]));
      }
      if (runRef.current !== runId) {
        controller.abort();
        return;
      }
      try {
        last = await verify(reference, controller.signal);
        const done = last.final;
        setView({ kind: 'result', data: last, stillChecking: !done });
        if (done) return;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404 || status === 400) {
          setView({ kind: 'error', message: 'We could not find this payment.' });
          return;
        }
        if (!last && i >= 2) {
          setView({
            kind: 'error',
            message: 'We could not reach the payment service. Please check your connection.',
          });
        }
      }
    }
    if (last) {
      setView({ kind: 'result', data: last, stillChecking: false });
    }
  }, [reference]);

  useEffect(() => {
    void run();
    return () => {
      runRef.current++;
    };
  }, [run]);

  if (view.kind === 'checking') {
    return <PageLoading label="Confirming your payment with the bank…" />;
  }

  if (view.kind === 'error') {
    return (
      <Card
        tone="error"
        icon={<AlertCircle className="h-7 w-7" />}
        title="Couldn't confirm the payment"
        body={view.message}
        reference={reference}
        action={
          reference ? (
            <button type="button" onClick={() => void run()} className={primaryBtn}>
              Try again
            </button>
          ) : null
        }
      />
    );
  }

  const { data, stillChecking } = view;
  const amount = `${data.currency} ${data.amount_mvr.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const checkoutHref = `/payments/checkout?reference=${encodeURIComponent(reference)}`;

  if (data.paid) {
    return (
      <Card
        tone="success"
        icon={<CheckCircle2 className="h-7 w-7" />}
        title="Payment successful"
        body={
          <>
            Thank you. <strong>{amount}</strong> has been received by Medianet
            {data.invoice_number ? <> for invoice {data.invoice_number}</> : null}.
          </>
        }
        reference={reference}
        details={
          data.receipt_number ? [{ label: 'Receipt', value: data.receipt_number }] : []
        }
        footer="You can close this page. Your technician has been notified."
      />
    );
  }

  if (data.status === 'FAILED' || data.status === 'CANCELLED') {
    return (
      <Card
        tone="error"
        icon={<XCircle className="h-7 w-7" />}
        title={data.status === 'FAILED' ? 'Payment failed' : 'Payment link closed'}
        body={
          data.status === 'FAILED'
            ? 'The bank did not approve this payment and no money was taken. Please ask your technician to send a new link.'
            : 'This payment link is no longer active and no money was taken. Please ask your technician to send a new link.'
        }
        reference={reference}
      />
    );
  }

  return (
    <Card
      tone="pending"
      icon={
        stillChecking ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <Clock className="h-7 w-7" />
        )
      }
      title={stillChecking ? 'Waiting for bank confirmation' : 'Payment not confirmed yet'}
      body={
        stillChecking ? (
          <>Keep this page open — this usually takes a few seconds.</>
        ) : (
          <>
            We haven&apos;t received confirmation from the bank. If you completed
            the payment, it will be recorded automatically within a few minutes —
            please don&apos;t pay again. If you didn&apos;t finish, you can continue
            below.
          </>
        )
      }
      reference={reference}
      action={
        stillChecking ? null : (
          <div className="mt-6 space-y-2">
            <button type="button" onClick={() => void run()} className={primaryBtn}>
              Check again
            </button>
            <a href={checkoutHref} className={secondaryBtn}>
              Continue to payment
            </a>
          </div>
        )
      }
    />
  );
}

const primaryBtn =
  'inline-block w-full rounded-xl bg-[#003366] px-4 py-3 text-sm font-semibold text-white hover:bg-[#002244] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366] focus-visible:ring-offset-2';
const secondaryBtn =
  'inline-block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366] focus-visible:ring-offset-2';

const toneClasses = {
  success: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  error: 'bg-red-50 text-red-600',
} as const;

function Card({
  tone,
  icon,
  title,
  body,
  reference,
  details = [],
  action,
  footer,
}: {
  tone: keyof typeof toneClasses;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  reference: string;
  details?: { label: string; value: string }[];
  action?: React.ReactNode;
  footer?: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md"
        role="status"
        aria-live="polite">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${toneClasses[tone]}`}>
          {icon}
        </div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
        {(reference || details.length > 0) && (
          <dl className="mt-5 space-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-left text-xs">
            {details.map(d => (
              <div key={d.label} className="flex justify-between gap-3">
                <dt className="text-slate-500">{d.label}</dt>
                <dd className="font-mono font-semibold text-slate-800">{d.value}</dd>
              </div>
            ))}
            {reference && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Reference</dt>
                <dd className="break-all text-right font-mono text-slate-600">{reference}</dd>
              </div>
            )}
          </dl>
        )}
        {action}
        {footer && <p className="mt-6 text-xs text-slate-500">{footer}</p>}
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
