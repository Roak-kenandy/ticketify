import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Payment' };

/** Customer-facing: always light, regardless of the admin theme stored on this device. */
export default function PaymentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 antialiased [color-scheme:light]">
      {children}
    </div>
  );
}
