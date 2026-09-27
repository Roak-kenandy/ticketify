import type { ReactNode } from 'react';

/** Customer payment pages — always light theme, scrollable (root layout uses overflow-hidden + dark mode). */
export default function PaymentsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100 text-slate-900 antialiased"
      style={{ color: '#0f172a' }}>
      {children}
    </div>
  );
}
