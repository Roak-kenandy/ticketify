"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import JSConfetti from "js-confetti";
import { AlertCircle, CheckCircle2, Loader2, StarIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api/v1";

const MAX_REVIEW_LENGTH = 2000;

const RATING_LABELS: Record<number, string> = {
  1: "Very poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

const RATING_TEXTS: Record<number, string> = {
  1: "We are sorry for the inconvenience. Please let us know how we can improve",
  2: "We are sorry for the inconvenience. Please let us know how we can improve",
  3: "Let us know how we can improve",
  4: "Great. We are glad you are satisfied",
  5: "We are glad you are satisfied",
};

function ReviewForm() {
  const searchParams = useSearchParams();
  const params = useParams();
  const ticketId = params?.ticketId as string;
  const userId = searchParams.get("userId");

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ rating?: string; review?: string }>({});

  useEffect(() => {
    if (submitted) {
      const confetti = new JSConfetti();
      confetti.addConfetti({
        emojis: ["⭐"],
        emojiSize: 40,
        confettiNumber: 50,
      });
    }
  }, [submitted]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (rating === 0) nextErrors.rating = "Please choose a rating.";
    if (!review.trim()) nextErrors.review = "Please write a short comment.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/feedbacks/${ticketId}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          rating,
          review: review.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 403) {
        toast.error(data?.message ?? "You have already submitted a review");
        return;
      }

      if (!res.ok) {
        toast.error(data?.message ?? "Failed to submit review");
        return;
      }

      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  const shownRating = hoveredRating || rating;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10 text-slate-900 [color-scheme:light]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://medianet.mv/img/medianet_logo.png"
          alt="Medianet"
          width={64}
          height={64}
          className="mx-auto mb-6 h-16 w-16 rounded-md object-contain"
        />

        {!userId ? (
          <div className="text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <h1 className="text-xl font-semibold">This review link is incomplete</h1>
            <p className="mt-2 text-sm text-slate-600">
              Please open the link exactly as it was sent to you, or contact Medianet.
            </p>
          </div>
        ) : submitted ? (
          <div className="text-center" role="status">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
            <h1 className="text-2xl font-bold">Thank you for your feedback</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your feedback helps us improve our service.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">How was your experience?</h1>
              <p className="mt-1 text-sm text-slate-600">
                Rate the service you received from our technician.
              </p>
            </div>

            <fieldset>
              <legend className="sr-only">Rating</legend>
              <div
                role="radiogroup"
                aria-label="Rating out of 5"
                aria-invalid={Boolean(errors.rating)}
                className="flex justify-center gap-1"
                onMouseLeave={() => setHoveredRating(0)}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} star${star > 1 ? "s" : ""}, ${RATING_LABELS[star]}`}
                    tabIndex={rating === star || (rating === 0 && star === 1) ? 0 : -1}
                    onMouseEnter={() => setHoveredRating(star)}
                    onClick={() => {
                      setRating(star);
                      setErrors((e) => ({ ...e, rating: undefined }));
                    }}
                    onKeyDown={(event) => {
                      const step =
                        event.key === "ArrowRight" || event.key === "ArrowUp"
                          ? 1
                          : event.key === "ArrowLeft" || event.key === "ArrowDown"
                            ? -1
                            : 0;
                      if (!step) return;
                      event.preventDefault();
                      const next = Math.min(5, Math.max(1, (rating || star) + step));
                      setRating(next);
                      const group = event.currentTarget.parentElement;
                      (group?.children[next - 1] as HTMLButtonElement | undefined)?.focus();
                    }}
                    className="rounded-md p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366]"
                  >
                    <StarIcon
                      className={cn(
                        "h-10 w-10",
                        star <= shownRating
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-300",
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-2 min-h-[1.25rem] text-center text-sm font-medium text-slate-700">
                {shownRating ? RATING_LABELS[shownRating] : ""}
              </p>
              {errors.rating && (
                <p className="text-center text-sm text-red-600">{errors.rating}</p>
              )}
              {rating > 0 && (
                <p className="mt-1 text-center text-sm text-slate-500">{RATING_TEXTS[rating]}</p>
              )}
            </fieldset>

            <div>
              <label htmlFor="review" className="mb-1.5 block text-sm font-medium">
                Your comments
              </label>
              <textarea
                id="review"
                className={cn(
                  "h-28 w-full resize-none rounded-lg border bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#003366]",
                  errors.review ? "border-red-400" : "border-slate-300",
                )}
                placeholder="Tell us about your experience..."
                value={review}
                maxLength={MAX_REVIEW_LENGTH}
                aria-invalid={Boolean(errors.review)}
                aria-describedby="review-help"
                onChange={(e) => {
                  setReview(e.target.value);
                  if (e.target.value.trim()) setErrors((prev) => ({ ...prev, review: undefined }));
                }}
              />
              <div id="review-help" className="mt-1 flex justify-between text-xs">
                <span className="text-red-600">{errors.review}</span>
                <span className="text-slate-400">
                  {review.length}/{MAX_REVIEW_LENGTH}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#002244] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Submitting…" : "Submit feedback"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-100" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-[#003366]" />
        </div>
      }
    >
      <ReviewForm />
    </Suspense>
  );
}
