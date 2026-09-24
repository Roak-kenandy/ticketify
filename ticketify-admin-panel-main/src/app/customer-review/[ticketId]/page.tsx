"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import JSConfetti from "js-confetti";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api/v1";

function ReviewForm() {
  const searchParams = useSearchParams();
  const params = useParams();
  const ticketId = params?.ticketId as string;
  const userId = searchParams.get("userId");

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [ratingSelected, setRatingSelected] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ratingTexts: Record<number, string> = {
    1: "We are sorry for the inconvenience. Please let us know how we can improve",
    2: "We are sorry for the inconvenience. Please let us know how we can improve",
    3: "Let us know how we can improve",
    4: "Great. We are glad you are satisfied",
    5: "We are glad you are satisfied",
  };

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

  const handleSubmit = async () => {
    if (!userId) {
      toast.error("Invalid review link. Missing user information.");
      return;
    }
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    if (!review.trim()) {
      toast.error("Please enter a short review comment");
      return;
    }

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

  return (
    <div className="flex justify-center bg-white items-center flex-col space-y-10 h-screen">
      <img
        src="https://medianet.mv/img/medianet_logo.png"
        alt="logo"
        width={80}
        height={80}
        className="w-20 h-20 rounded-md"
      />

      {submitted ? (
        <div className="flex flex-col space-y-5 items-center text-center justify-center">
          <h1 className="text-3xl text-black font-bold">
            Thank you for your feedback
          </h1>
          <p className="text-gray-500 w-72">
            Your feedback helps us improve our service
          </p>
        </div>
      ) : (
        <div className="flex flex-col space-y-5 items-center text-center justify-center">
          <h1 className="text-3xl text-black font-bold">
            How was your experience?
          </h1>
          <div className="flex space-x-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <StarIcon
                key={star}
                className={`w-10 h-10 cursor-pointer ${
                  star <= (hoveredRating || rating)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                }`}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                onClick={() => {
                  setRating(star);
                  setRatingSelected(true);
                }}
              />
            ))}
          </div>
          {ratingSelected && (
            <p className="text-gray-500 w-72">{ratingTexts[rating]}</p>
          )}
          <textarea
            className="w-72 h-24 p-3 border border-gray-300 rounded-lg text-black"
            placeholder="Tell us about your experience..."
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          Loading...
        </div>
      }>
      <ReviewForm />
    </Suspense>
  );
}
