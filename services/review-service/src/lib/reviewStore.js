const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SEED_PATH = path.join(DATA_DIR, "reviews.seed.json");

// Reviews people submit go to a runtime file (git-ignored) that is created
// from the tracked seed on first use, so the seed never gets dirtied.
function dataPath() {
  return process.env.REVIEWS_FILE || path.join(DATA_DIR, "reviews.json");
}

function loadReviews() {
  const file = dataPath();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(SEED_PATH, file);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveReviews(reviews) {
  const file = dataPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(reviews, null, 2));
  fs.renameSync(tmp, file); // atomic, so a crash can't leave a half-written file
}

const round1 = (n) => Math.round(n * 10) / 10;

function average(reviews) {
  return reviews.length ? round1(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : null;
}

/** Newest-first reviews for one gym, with count and average rating. */
function summaryFor(gymId, reviews = loadReviews()) {
  const forGym = reviews
    .filter((r) => r.gymId === gymId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { gymId, count: forGym.length, average: average(forGym), reviews: forGym };
}

/** Map of gymId -> { count, average }, computed in one pass over all reviews. */
function ratingsByGym(reviews = loadReviews()) {
  const grouped = new Map();
  for (const review of reviews) {
    if (!grouped.has(review.gymId)) grouped.set(review.gymId, []);
    grouped.get(review.gymId).push(review);
  }
  return new Map([...grouped].map(([gymId, list]) => [gymId, { count: list.length, average: average(list) }]));
}

function addReview({ gymId, author, rating, comment }) {
  const reviews = loadReviews();
  const review = {
    id: crypto.randomUUID(),
    gymId,
    author,
    rating,
    comment,
    createdAt: new Date().toISOString(),
  };
  reviews.push(review);
  saveReviews(reviews);
  return review;
}

module.exports = { loadReviews, saveReviews, summaryFor, ratingsByGym, addReview };
