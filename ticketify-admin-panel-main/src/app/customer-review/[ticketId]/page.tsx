"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Image from "next/image";
import JSConfetti from "js-confetti";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const ticketId = params?.ticketId as string;
  const userId = searchParams.get("userId");

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [ratingSelected, setRatingSelected] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [review, setReview] = useState("");

  const ratingTexts: {
    [key: number]: string;
  } = {
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
    if (rating === 0) {
      alert("Please select a rating");
      return;
    }

    try {
      const res = await fetch(
        `https://api.ticketify.medianet.mv/api/v1/feedbacks/${ticketId}`,
        {
          method: "POST",
          mode: "cors",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            rating,
            review,
          }),
        }
      );

      if (res.status === 403) {
        alert("You have already submitted a review");
        return;
      }

      const data = await res.json();
      if (data.statusText === 403) {
        alert(data.message);
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again later.");
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
          <h1 className="text-3xl text-black font-bold">Thank you for your feedback</h1>
          <p className="text-gray-500 text-black w-72">
            We appreciate your feedback to improve our services. You may close
            this window
          </p>
        </div>
      ) : (
        <div className="flex flex-col space-y-10 items-center justify-center">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl text-black font-bold">
              Please rate the service you received
            </h1>
            <p className="text-gray-500">
              We appreciate your feedback to improve our services
            </p>
          </div>

          <div className="flex items-center justify-center space-x-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                onClick={() => {
                  setRating(star);
                  setRatingSelected(true);
                }}
                className="text-6xl"
              >
                <StarIcon
                  className={`h-16 w-16 ${
                    star <= (hoveredRating || rating)
                      ? "text-yellow-500"
                      : "text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>

          {ratingSelected && (
            <div className="text-center max-w-lg w-72">
              <p className="text-gray-800 text-sm font-medium">
                {ratingTexts[rating]}
              </p>
            </div>
          )}

          <textarea
            onChange={(e) => setReview(e.target.value)}
            value={review}
            className="border-2 text-black max-w-sm w-full h-32 rounded-xl bg-white border-gray-300 p-2"
            placeholder="Write your review here..."
          />

          <Button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Submit Review
          </Button>
        </div>
      )}
    </div>
  );
}
