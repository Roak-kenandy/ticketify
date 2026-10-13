"use client";

import React from "react";
import { fetchFileObjectUrl } from "@/lib/field/api";
import { useSession } from "@/lib/field/session";

const cache = new Map<string, Promise<string>>();

/** Object URL for an authenticated ticket file; shared across thumbnails and the viewer. */
export function useFileUrl(fileId?: string) {
  const { token } = useSession();
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!fileId || !token) {
      return;
    }
    let cancelled = false;
    let pending = cache.get(fileId);
    if (!pending) {
      pending = fetchFileObjectUrl(fileId, token);
      cache.set(fileId, pending);
      pending.catch(() => cache.delete(fileId));
    }
    pending.then(
      (value) => !cancelled && setUrl(value),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [fileId, token]);

  return { url, failed };
}
