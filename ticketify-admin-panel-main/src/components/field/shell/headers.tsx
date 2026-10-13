"use client";

import { ChevronLeft, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { cn } from "@/lib/field/cn";
import { fieldContainer } from "@/lib/field/layout";
import { useDrawer } from "./app-shell";

/** Primary-coloured header for drawer screens (menu button + title). */
export function ScreenHeader({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  /** Rendered under the title inside the sticky header (e.g. tabs). */
  children?: React.ReactNode;
  /** Match pages that use the wide content container. */
  wide?: boolean;
}) {
  const drawer = useDrawer();
  const container = wide ? fieldContainer.wide : fieldContainer.narrow;
  return (
    <header className="sticky top-0 z-30 bg-primary pt-[env(safe-area-inset-top)]">
      <div className={cn(container, "flex items-center gap-3 px-4 py-3 sm:py-4")}>
        <button
          type="button"
          onClick={drawer.open}
          aria-label="Open menu"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md bg-white lg:hidden"
        >
          <Menu className="h-[22px] w-[22px] text-primary" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-white sm:text-[22px]">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-[13px] text-white/80">{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className={cn(container, "px-4 pb-3")}>{children}</div> : null}
    </header>
  );
}

/** Header for pushed screens (back button, title, optional right action). */
export function StackHeader({
  title,
  subtitle,
  right,
  backHref,
  wide,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  backHref?: string;
  wide?: boolean;
}) {
  const router = useRouter();
  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(backHref ?? "/field");
    }
  };
  return (
    <header className="sticky top-0 z-30 bg-primary pt-[env(safe-area-inset-top)]">
      <div className={cn(wide ? fieldContainer.wide : fieldContainer.narrow, "flex items-center gap-3 px-4 py-3")}>
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/15"
        >
          <ChevronLeft className="h-6 w-6 text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-white">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-white/80">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  );
}
