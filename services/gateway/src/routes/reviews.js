const express = require("express");
const config = require("../config");
const { call, passThrough } = require("../lib/upstream");

const router = express.Router();

const wrap = (handler) => (req, res, next) => handler(req, res).catch(next);

// Validation lives in the review service; the gateway only forwards.
router.get(
  "/gym/:gymId",
  wrap(async (req, res) => {
    const result = await call("review-service", config.REVIEW_SERVICE_URL, `/reviews/gym/${encodeURIComponent(req.params.gymId)}`, {
      timeoutMs: config.REVIEW_TIMEOUT_MS,
    });
    passThrough(res, "review-service", result);
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const result = await call("review-service", config.REVIEW_SERVICE_URL, "/reviews", {
      method: "POST",
      body: req.body ?? {},
      timeoutMs: config.REVIEW_TIMEOUT_MS,
    });
    passThrough(res, "review-service", result);
  })
);

module.exports = router;
