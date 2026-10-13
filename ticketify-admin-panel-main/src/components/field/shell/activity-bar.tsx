"use client";

import React from "react";
import { subscribeApiLoading } from "@/lib/field/api";

/** Thin top progress bar while a user-initiated API request is in flight. */
export function ActivityBar() {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => subscribeApiLoading((count) => setActive(count > 0)), []);
  if (!active) {
    return null;
  }
  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-secondary/30">
      <div className="h-full w-1/3 animate-[slideBar_1s_ease-in-out_infinite] bg-secondary" />
      <style>{`@keyframes slideBar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
