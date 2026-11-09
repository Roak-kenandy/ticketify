"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { AdminAuth } from "@/lib/admin-auth";

type StockAlert = {
  key: string;
  request_id: string;
  status: "OPEN" | "FULFILLED" | "CANCELLED";
  title: string;
  body: string;
  at: string;
};

type AlertsResponse = { audience: "STORE" | "SUPERVISOR"; items: StockAlert[] };

const POLL_MS = 30_000;
const STOCK_PAGE = "/inventory/stock";

/** "announced" = already toasted; "viewed" = seen on the stock page (clears a supervisor's badge). */
type KeyList = "announced" | "viewed";

function storageKey(list: KeyList) {
  return `ticketify.stockAlerts.${list}.${AdminAuth.getUserInfo()?.sub ?? "anon"}`;
}

function readKeys(list: KeyList): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey(list)) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeKeys(list: KeyList, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey(list), JSON.stringify([...keys].slice(-300)));
  } catch {
    // Storage full or private mode: alerts may repeat, nothing else breaks.
  }
}

/**
 * Stock request alerts for the console: the store hears about new requests, a
 * supervisor hears when theirs is issued or declined. Polls while the console is
 * open; shows a toast, a desktop notification when the tab is in the background,
 * and returns the count for the sidebar badge.
 */
export function useStockAlerts(enabled: boolean, pathname: string) {
  const router = useRouter();
  const [badge, setBadge] = React.useState(0);
  const audience = React.useRef<AlertsResponse["audience"] | null>(null);
  const latest = React.useRef<StockAlert[]>([]);

  const markViewed = React.useCallback(() => {
    const viewed = readKeys("viewed");
    latest.current.forEach((alert) => viewed.add(alert.key));
    writeKeys("viewed", viewed);
    if (audience.current === "SUPERVISOR") setBadge(0);
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    const announce = (fresh: StockAlert[]) => {
      const open = () => router.push(STOCK_PAGE);
      if (fresh.length > 3) {
        toast.info(`${fresh.length} stock request updates`, { action: { label: "View", onClick: open } });
      } else {
        fresh.forEach((alert) =>
          toast.info(alert.title, { description: alert.body, action: { label: "View", onClick: open }, duration: 10_000 }),
        );
      }
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        fresh.slice(0, 3).forEach((alert) => {
          const note = new Notification(alert.title, { body: alert.body, tag: alert.key, icon: "/logo.png" });
          note.onclick = () => {
            window.focus();
            open();
            note.close();
          };
        });
      }
    };

    const poll = async () => {
      try {
        const { data } = await axiosInterceptorInstance.get<AlertsResponse>("/inventory/stock/requests/alerts");
        if (stopped) return;
        audience.current = data.audience;
        latest.current = data.items ?? [];
        const announced = readKeys("announced");
        const fresh = latest.current.filter((alert) => !announced.has(alert.key));
        if (fresh.length) {
          announce(fresh);
          fresh.forEach((alert) => announced.add(alert.key));
          writeKeys("announced", announced);
        }
        // The store's badge is the open queue; a supervisor's clears once they look at the page.
        const viewed = readKeys("viewed");
        setBadge(
          data.audience === "STORE"
            ? latest.current.length
            : latest.current.filter((alert) => !viewed.has(alert.key)).length,
        );
      } catch {
        // Offline or signed out: try again next tick.
      }
    };

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled, router]);

  React.useEffect(() => {
    if (enabled && pathname === STOCK_PAGE) markViewed();
  }, [enabled, pathname, badge, markViewed]);

  return badge;
}

/** Asks for desktop notification permission (browsers require a click). */
export function DesktopAlertsButton() {
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("granted");

  React.useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  if (permission !== "default") return null;
  return (
    <Button
      variant="ghost"
      onClick={async () => setPermission(await Notification.requestPermission())}
      title="Get a desktop notification for stock requests even when this tab is in the background"
    >
      <BellRing className="h-4 w-4" />
      Turn on desktop alerts
    </Button>
  );
}
