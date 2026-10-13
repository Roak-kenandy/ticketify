"use client";

import React from "react";
import { Overlay } from "./overlay";

/** Centred dialog stacked above a workflow sheet (review / reverse / confirm steps). */
export function Prompt({
  open,
  title,
  lead,
  onCancel,
  actions,
  children,
}: {
  open: boolean;
  title: string;
  lead?: React.ReactNode;
  onCancel: () => void;
  actions: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Overlay open={open} onEscape={onCancel}>
      <div className="fixed inset-0 z-[70] flex animate-fade-in items-center justify-center bg-[rgba(15,23,42,0.55)] p-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-xl bg-white p-5 shadow-sheet"
        >
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {lead ? <div className="whitespace-pre-line text-sm leading-5 text-gray2">{lead}</div> : null}
          {children ? <div className="min-h-0 overflow-y-auto">{children}</div> : null}
          <div className="flex gap-3 pt-1">{actions}</div>
        </div>
      </div>
    </Overlay>
  );
}
