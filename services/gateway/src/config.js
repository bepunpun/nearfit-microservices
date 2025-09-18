const int = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

module.exports = {
  PORT: process.env.PORT || 4100,
  GYM_SERVICE_URL: process.env.GYM_SERVICE_URL || "http://localhost:4101",
  REVIEW_SERVICE_URL: process.env.REVIEW_SERVICE_URL || "http://localhost:4102",
  // The gym service may spend two Overpass attempts (20 s each) before it falls back to sample data.
  GYM_TIMEOUT_MS: int(process.env.GYM_TIMEOUT_MS, 45000),
  // Ratings are nice to have: don't hold a search hostage to a slow review service.
  REVIEW_TIMEOUT_MS: int(process.env.REVIEW_TIMEOUT_MS, 3000),
  HEALTH_TIMEOUT_MS: int(process.env.HEALTH_TIMEOUT_MS, 2000),
};
