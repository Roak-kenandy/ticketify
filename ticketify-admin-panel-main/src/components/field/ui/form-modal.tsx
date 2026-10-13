"use client";

import { Loader2, X } from "lucide-react";
import React from "react";
import { Overlay } from "./overlay";

type FooterProps = {
  onSubmit: () => void;
  submitText?: string;
  cancelText?: string;
  submitDisabled?: boolean;
};

/**
 * Shared dialog shell for every form: dimmed backdrop, scrollable body,
 * consistent header and Cancel / Submit footer. Closing is blocked while loading.
 */
export default function FormModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer?: FooterProps;
  loading?: boolean;
}) {
  const close = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Overlay open={visible} onEscape={close}>
      <div
        className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-[rgba(15,23,42,0.55)] sm:items-center sm:p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            close();
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flex max-h-[92dvh] w-full max-w-[520px] animate-slide-up flex-col gap-3 rounded-t-xl bg-white p-5 shadow-sheet sm:animate-fade-in sm:rounded-xl"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-0.5">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              {subtitle ? <p className="text-[13px] text-gray2">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={close}
              disabled={loading}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-gray2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="-mx-1 flex flex-col gap-4 overflow-y-auto px-1 pb-1">{children}</div>
          {footer ? (
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="h-12 flex-1 rounded-md border border-bordergray bg-white text-[15px] font-semibold text-ink disabled:opacity-50"
              >
                {footer.cancelText ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={footer.onSubmit}
                disabled={loading || footer.submitDisabled}
                className="flex h-12 flex-1 items-center justify-center rounded-md bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : footer.submitText ?? "Submit"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}
