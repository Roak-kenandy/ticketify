"use client";

import React from "react";
import { apiGet } from "@/lib/field/api";
import { useSession } from "@/lib/field/session";
import type { MyStock } from "@/types/field-workflow";

export function useMyStock(enabled = true) {
  const { token } = useSession();
  const [stock, setStock] = React.useState<MyStock | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const reload = React.useCallback(async () => {
    if (!token) return null;
    setLoading(true);
    setError("");
    try {
      const next: MyStock = await apiGet("/inventory/stock/mine", token, { silent: true });
      setStock(next);
      return next;
    } catch (err: any) {
      setError(err?.message || "Could not load your stock");
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (enabled) {
      void reload();
    }
  }, [enabled, reload]);

  return { stock, loading, error, reload };
}

/** Every serialized unit the user holds, e.g. for an ONT dropdown. */
export function issuedSerials(stock: MyStock | null) {
  return (stock?.items ?? []).flatMap((entry) =>
    entry.item.serialized
      ? entry.serials.map((serial) => ({
          serial: serial.serial_number,
          itemId: entry.item.id,
          itemName: entry.item.name,
        }))
      : [],
  );
}
