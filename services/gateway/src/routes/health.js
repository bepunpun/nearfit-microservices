const express = require("express");
const config = require("../config");
const { call } = require("../lib/upstream");

const router = express.Router();

async function isUp(service, baseUrl) {
  try {
    const result = await call(service, baseUrl, "/health", { timeoutMs: config.HEALTH_TIMEOUT_MS });
    return result.ok;
  } catch {
    return false;
  }
}

// 200 only when every service answers, so it doubles as a dependency-aware check.
router.get("/", async (req, res) => {
  const [gym, review] = await Promise.all([
    isUp("gym-service", config.GYM_SERVICE_URL),
    isUp("review-service", config.REVIEW_SERVICE_URL),
  ]);
  const ok = gym && review;
  res.status(ok ? 200 : 503).json({
    service: "gateway",
    status: ok ? "ok" : "degraded",
    services: { "gym-service": gym ? "ok" : "down", "review-service": review ? "ok" : "down" },
  });
});

module.exports = router;
