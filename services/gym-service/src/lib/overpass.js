const { parseOpeningHours } = require("./openingHours");

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const REQUEST_TIMEOUT_MS = 20000;

// Cheap, deterministic color per brand so the same gym always renders with
// the same pin/badge color across requests.
const PALETTE = ["#f94144", "#f3722c", "#f9c74f", "#43aa8b", "#277da1", "#6a4c93", "#a663cc", "#4d908e"];
function colorFor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const cache = new Map(); // key -> { expiresAt, data }
const CACHE_TTL_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = Number(process.env.OVERPASS_RETRY_DELAY_MS ?? 1000);

function cacheKey(lat, lng, radiusMeters) {
  // round to ~100m so nearby requests share a cache entry
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}`;
}

async function runQuery(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Accept: "application/json",
        "User-Agent": "nearfit/1.0 (student project)",
      },
      body: query,
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const TAG_AMENITIES = [
  ["wheelchair", "yes", "Wheelchair accessible"],
  ["shower", "yes", "Showers"],
  ["internet_access", "wlan", "Wi-Fi"],
];

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).replace(/_/g, " ");
}

function amenitiesFor(tags) {
  const sports = (tags.sport || "").split(";").map((s) => s.trim()).filter(Boolean).map(titleCase);
  const extras = TAG_AMENITIES.filter(([key, value]) => tags[key] === value).map(([, , label]) => label);
  return [...new Set(["Fitness center", ...sports, ...extras])];
}

/** Nodes carry lat/lon directly; ways/relations get a `center` from `out center`. */
function elementToGym(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const tags = el.tags || {};
  const name = tags.name || tags.brand || tags.operator || "Fitness center";
  const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    color: colorFor(tags.brand || name),
    lat,
    lng: lon,
    address: addressParts.join(" ") || tags["addr:full"] || "Address unavailable",
    hours: parseOpeningHours(tags.opening_hours),
    priceLevel: null, // OSM doesn't reliably carry pricing for gyms
    amenities: amenitiesFor(tags),
    description: tags.brand
      ? `${tags.brand} location in the area.`
      : "Fitness center listed on OpenStreetMap.",
    source: "osm",
    phone: tags.phone || tags["contact:phone"] || null,
    website: tags.website || tags["contact:website"] || null,
  };
}

async function fetchNearbyGyms(lat, lng, radiusMeters) {
  const key = cacheKey(lat, lng, radiusMeters);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  // nwr = nodes, ways and relations: most gyms are mapped as building outlines
  const query = `
    [out:json][timeout:18];
    (
      nwr["leisure"="fitness_centre"](around:${radiusMeters},${lat},${lng});
      nwr["sport"="fitness"]["leisure"!="fitness_centre"](around:${radiusMeters},${lat},${lng});
    );
    out center tags;
  `;

  let json;
  try {
    try {
      json = await runQuery(query);
    } catch (err) {
      // Public Overpass instances occasionally return a transient 504 under
      // load; one retry clears most of those without hiding real failures.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      json = await runQuery(query);
    }
  } catch (err) {
    // Prefer slightly stale live data over the sample dataset.
    if (cached) return cached.data;
    throw err;
  }

  const gyms = (json.elements || []).map(elementToGym).filter(Boolean);

  cache.set(key, { data: gyms, expiresAt: Date.now() + CACHE_TTL_MS });
  return gyms;
}

const OSM_ID_RE = /^osm-(?:(node|way|relation)-)?(\d+)$/;

/** Accepts "osm-way-123", or the legacy "osm-123" (a node). Returns null for anything else. */
function parseGymId(id) {
  const match = OSM_ID_RE.exec(id);
  return match ? { type: match[1] || "node", osmId: match[2] } : null;
}

async function fetchGymById(id) {
  const parsed = parseGymId(id);
  if (!parsed) return null;

  const query = `[out:json][timeout:10]; ${parsed.type}(${parsed.osmId}); out center tags;`;
  const json = await runQuery(query);
  const el = (json.elements || [])[0];
  return el ? elementToGym(el) : null;
}

function clearCache() {
  cache.clear();
}

module.exports = { fetchNearbyGyms, fetchGymById, parseGymId, clearCache };
