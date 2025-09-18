const config = require("../config");
const { call } = require("./upstream");

/**
 * Rating summaries for every reviewed gym, from the review service.
 * Never throws: if the review service is down or slow, gyms are served without
 * ratings (count 0, no average) rather than failing the whole search.
 */
async function fetchRatings() {
  try {
    const result = await call("review-service", config.REVIEW_SERVICE_URL, "/reviews/ratings", {
      timeoutMs: config.REVIEW_TIMEOUT_MS,
    });
    if (result.ok && result.data) return result.data;
    console.warn(`review-service answered ${result.status}, serving gyms without ratings`);
  } catch (err) {
    console.warn(`${err.message}, serving gyms without ratings`);
  }
  return {};
}

function withRating(gym, ratings) {
  const rating = Object.hasOwn(ratings, gym.id) ? ratings[gym.id] : null;
  return { ...gym, reviewCount: rating?.count ?? 0, averageRating: rating?.average ?? null };
}

module.exports = { fetchRatings, withRating };
