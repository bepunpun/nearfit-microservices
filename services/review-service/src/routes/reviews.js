const express = require("express");
const { summaryFor, ratingsByGym, addReview } = require("../lib/reviewStore");

const router = express.Router();

const MAX_AUTHOR_LENGTH = 40;
const MAX_COMMENT_LENGTH = 500;

// Rating summary for every gym that has reviews: { [gymId]: { count, average } }.
// The gateway calls this once per search instead of once per gym.
router.get("/ratings", (req, res) => {
  res.json(Object.fromEntries(ratingsByGym()));
});

router.get("/gym/:gymId", (req, res) => {
  res.json(summaryFor(req.params.gymId));
});

router.post("/", (req, res) => {
  const { gymId, author, rating, comment } = req.body || {};

  if (typeof gymId !== "string" || !gymId.trim() || typeof author !== "string" || !author.trim() ||
      typeof comment !== "string" || !comment.trim()) {
    return res.status(400).json({ error: "gymId, author, and comment are required" });
  }
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: "rating must be an integer from 1 to 5" });
  }
  if (author.trim().length > MAX_AUTHOR_LENGTH) {
    return res.status(400).json({ error: `author must be at most ${MAX_AUTHOR_LENGTH} characters` });
  }
  if (comment.trim().length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `comment must be at most ${MAX_COMMENT_LENGTH} characters` });
  }

  const review = addReview({
    gymId: gymId.trim(),
    author: author.trim(),
    rating: numericRating,
    comment: comment.trim(),
  });
  res.status(201).json(review);
});

module.exports = router;
