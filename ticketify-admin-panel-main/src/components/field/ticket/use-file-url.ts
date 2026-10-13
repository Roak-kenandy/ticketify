"use client";

import React from "react";
import { fetchFileObjectUrl } from "@/lib/field/api";
import { useSession } from "@/lib/field/session";

const cache = new Map<string, Promise<string>>();

/** Object URL for an authenticated ticket file; shared across thumbnails and the viewer. */
export function useFileUrl(ticketId?: string, fileId?: string) {
  const { token } = useSession();
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!ticketId || !fileId || !token) {
      return;
    }
    let cancelled = false;
    const key = `${ticketId}/${fileId}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = fetchFileObjectUrl(ticketId, fileId, token);
      cache.set(key, pending);
      pending.catch(() => cache.delete(key));
    }
    pending.then(
      (value) => !cancelled && setUrl(value),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [ticketId, fileId, token]);

  return { url, failed };
}
