const express = require("express");
const config = require("../config");
const { call, passThrough } = require("../lib/upstream");
const { fetchRatings, withRating } = require("../lib/ratings");

const router = express.Router();

const FORWARDED_PARAMS = ["lat", "lng", "radius", "openNow"];

const wrap = (handler) => (req, res, next) => handler(req, res).catch(next);

// gym-service finds the gyms, review-service knows their ratings; the client gets one answer.
router.get(
  "/nearby",
  wrap(async (req, res) => {
    const params = new URLSearchParams();
    for (const key of FORWARDED_PARAMS) {
      if (typeof req.query[key] === "string") params.set(key, req.query[key]);
    }

    const [gymResult, ratings] = await Promise.all([
      call("gym-service", config.GYM_SERVICE_URL, `/gyms/nearby?${params}`, { timeoutMs: config.GYM_TIMEOUT_MS }),
      fetchRatings(),
    ]);
    if (!gymResult.ok || gymResult.data === null) return passThrough(res, "gym-service", gymResult);

    const { dataSource, gyms } = gymResult.data;
    const withRatings = gyms.map((gym) => withRating(gym, ratings));
    res.json({ dataSource, count: withRatings.length, gyms: withRatings });
  })
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const [gymResult, ratings] = await Promise.all([
      call("gym-service", config.GYM_SERVICE_URL, `/gyms/${encodeURIComponent(req.params.id)}`, {
        timeoutMs: config.GYM_TIMEOUT_MS,
      }),
      fetchRatings(),
    ]);
    if (!gymResult.ok || gymResult.data === null) return passThrough(res, "gym-service", gymResult);

    res.json(withRating(gymResult.data, ratings));
  })
);

module.exports = router;
