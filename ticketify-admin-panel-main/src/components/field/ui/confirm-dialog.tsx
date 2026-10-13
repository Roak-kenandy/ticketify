"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/field/cn";
import { Overlay } from "./overlay";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText = "Cancel",
  destructive,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay open={open} onEscape={loading ? undefined : onCancel}>
      <div
        className="fixed inset-0 z-[70] flex animate-fade-in items-center justify-center bg-[rgba(15,23,42,0.55)] p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !loading) {
            onCancel();
          }
        }}
      >
        <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-sheet">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {message ? <p className="mt-2 text-sm leading-5 text-gray2">{message}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-gray2 disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={cn(
                "flex min-w-24 items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60",
                destructive ? "bg-error" : "bg-primary",
              )}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmText}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
