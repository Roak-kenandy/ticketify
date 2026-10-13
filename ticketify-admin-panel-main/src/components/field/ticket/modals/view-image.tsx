"use client";

import { ImageOff, Loader2, X } from "lucide-react";
import React from "react";
import { Overlay } from "@/components/field/ui/overlay";
import { useFileUrl } from "../use-file-url";

export default function ViewImageModal({
  ticketId,
  image,
  visible,
  onClose,
}: {
  ticketId: string;
  image: any;
  visible: boolean;
  onClose: () => void;
}) {
  const { url, failed } = useFileUrl(ticketId, visible ? image?.file?.id : undefined);

  return (
    <Overlay open={visible} onEscape={onClose}>
      <div
        className="fixed inset-0 z-[60] flex animate-fade-in flex-col items-center justify-center gap-4 bg-black/90 p-3"
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image"
          className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15"
        >
          <X className="h-6 w-6 text-white" />
        </button>
        <div className="flex h-[70dvh] w-full items-center justify-center overflow-hidden rounded-lg">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={image?.description || "Attachment"}
              className="max-h-full max-w-full object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          ) : failed || !image?.file?.id ? (
            <div className="flex flex-col items-center gap-2">
              <ImageOff className="h-10 w-10 text-white/70" />
              <p className="text-sm text-white/80">Couldn&apos;t load this image</p>
            </div>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          )}
        </div>
        {image?.description ? <p className="px-5 text-center text-sm text-white">{image.description}</p> : null}
      </div>
    </Overlay>
  );
}
