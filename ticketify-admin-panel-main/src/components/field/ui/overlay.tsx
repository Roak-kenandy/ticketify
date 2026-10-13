"use client";

import React from "react";
import { createPortal } from "react-dom";

let lockCount = 0;

/** Portal + body scroll lock + Escape handling shared by every overlay. */
export function Overlay({
  open,
  onEscape,
  children,
}: {
  open: boolean;
  onEscape?: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  const escapeRef = React.useRef(onEscape);
  escapeRef.current = onEscape;

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    lockCount += 1;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        escapeRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = "";
      }
    };
  }, [open]);

  if (!open || !mounted) {
    return null;
  }
  return createPortal(<div className="field-app">{children}</div>, document.body);
}
