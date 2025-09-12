const express = require("express");
const fallbackGyms = require("../data/gyms.json");
const { distanceKm } = require("../lib/geo");
const { resolveToday } = require("../lib/openingHours");
const { fetchNearbyGyms, fetchGymById, parseGymId } = require("../lib/overpass");

const MAX_RADIUS_KM = 25;

const router = express.Router();

function withOpenStatus(gym) {
  const { openNow, hours } = resolveToday(gym.hours);
  return { ...gym, hours, openNow };
}

function withDistance(gym, lat, lng) {
  return { ...withOpenStatus(gym), distanceKm: Math.round(distanceKm(lat, lng, gym.lat, gym.lng) * 10) / 10 };
}

// Ratings are not this service's business: the gateway adds them from the review service.
router.get("/nearby", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = Math.min(parseFloat(req.query.radius) || 5, MAX_RADIUS_KM);
  const openNow = req.query.openNow === "true";

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "lat and lng query params are required and must be valid coordinates" });
  }

  let gyms;
  let dataSource = "osm";

  try {
    gyms = await fetchNearbyGyms(lat, lng, Math.round(radiusKm * 1000));
  } catch (err) {
    console.warn("Overpass lookup failed, using fallback dataset:", err.message);
    gyms = fallbackGyms;
    dataSource = "fallback";
  }

  let results = gyms.map((gym) => withDistance(gym, lat, lng)).filter((gym) => gym.distanceKm <= radiusKm);

  if (openNow) {
    results = results.filter((gym) => gym.openNow === true);
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({ dataSource, count: results.length, gyms: results });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (id.startsWith("osm-")) {
    if (!parseGymId(id)) return res.status(400).json({ error: "invalid gym id" });
    try {
      const gym = await fetchGymById(id);
      if (!gym) return res.status(404).json({ error: "gym not found" });
      return res.json(withOpenStatus(gym));
    } catch (err) {
      return res.status(502).json({ error: "could not reach OpenStreetMap", detail: err.message });
    }
  }

  const gym = fallbackGyms.find((g) => g.id === id);
  if (!gym) return res.status(404).json({ error: "gym not found" });
  res.json(withOpenStatus(gym));
});

module.exports = router;
