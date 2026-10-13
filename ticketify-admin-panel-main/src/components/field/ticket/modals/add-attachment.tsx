"use client";

import { Camera, Images, Trash2 } from "lucide-react";
import React from "react";
import FormModal from "@/components/field/ui/form-modal";
import { apiRequest } from "@/lib/field/api";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";

/** Full-resolution phone photos are 4-8 MB and make uploads over mobile data slow. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

async function resizeImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export default function AddAttachmentModal({
  ticketId,
  visible,
  onClose,
  onSuccess,
}: {
  ticketId: string;
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { token } = useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState("");
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) {
      return;
    }
    if (!picked.type.startsWith("image/")) {
      showError("Choose a photo (JPG or PNG).");
      return;
    }
    setFile(picked);
    setError("");
  };

  async function submit() {
    if (!file) {
      setError("Choose or take a photo first.");
      return;
    }
    if (!description.trim()) {
      setError("Add a short description.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const blob = await resizeImage(file);
      const name = blob === file ? file.name : `${file.name.replace(/\.[^.]+$/, "") || `photo-${Date.now()}`}.jpg`;
      const form = new FormData();
      form.append("description", description.trim());
      form.append("file", blob, name);
      await apiRequest("POST", `/tickets/${ticketId}/attachments`, token, form, { timeoutMs: 90000 });
      showSuccess("Photo attached");
      setFile(null);
      setDescription("");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      showError(err?.message || "Could not upload the photo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      onClose={() => {
        setError("");
        onClose();
      }}
      title="Add attachment"
      subtitle="Attach a site photo to this ticket."
      loading={submitting}
      footer={{ onSubmit: submit, submitText: "Upload" }}
    >
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPicked} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onPicked} />
      {file && preview ? (
        <div className="flex items-center gap-3 rounded-md bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected photo" className="h-16 w-16 rounded-sm object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{file.name || "Photo"}</p>
            <p className="field-hint">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            disabled={submitting}
            aria-label="Remove photo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-error-bg"
          >
            <Trash2 className="h-[18px] w-[18px] text-error" />
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <PickButton icon={<Camera className="h-[26px] w-[26px] text-primary" />} label="Take photo" onClick={() => cameraRef.current?.click()} />
          <PickButton icon={<Images className="h-[26px] w-[26px] text-primary" />} label="From gallery" onClick={() => galleryRef.current?.click()} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="field-label" htmlFor="attachment-description">
          Description
        </label>
        <textarea
          id="attachment-description"
          className="textarea"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            if (error) {
              setError("");
            }
          }}
          placeholder="e.g. ONT installed on the living room wall"
          disabled={submitting}
        />
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </FormModal>
  );
}

function PickButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-tertiary bg-surface py-5"
    >
      {icon}
      <span className="text-[13px] font-semibold text-primary">{label}</span>
    </button>
  );
}
