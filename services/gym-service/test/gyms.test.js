process.env.OVERPASS_RETRY_DELAY_MS = "0";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/server");
const { clearCache } = require("../src/lib/overpass");

// Tunis city centre
const NEAR = "lat=36.8&lng=10.18";

const realFetch = global.fetch;
let server;
let base;
let overpassCalls;
let overpassBodies;
let overpassHandler;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // Only Overpass is stubbed; requests to our own server go through untouched.
  global.fetch = async (url, options) => {
    if (String(url).includes("overpass")) {
      overpassCalls += 1;
      overpassBodies.push(options.body);
      return overpassHandler(options);
    }
    return realFetch(url, options);
  };
});

after(() => {
  global.fetch = realFetch;
  server.close();
});

beforeEach(() => {
  clearCache();
  overpassCalls = 0;
  overpassBodies = [];
  overpassHandler = async () => okJson(ELEMENTS);
});

const okJson = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
const failing = async () => ({ ok: false, status: 504, json: async () => ({}) });

const ELEMENTS = [
  { type: "node", id: 1, lat: 36.802, lon: 10.18, tags: { name: "Always Open", leisure: "fitness_centre", opening_hours: "24/7", sport: "fitness;yoga" } },
  { type: "way", id: 2, center: { lat: 36.81, lon: 10.19 }, tags: { leisure: "fitness_centre", brand: "Big Brand", wheelchair: "yes" } },
  { type: "node", id: 3, lat: 36.8, lon: 10.4, tags: { name: "Too Far", leisure: "fitness_centre" } }, // ~20 km
  { type: "relation", id: 4, tags: { name: "No Position" } },
];

const get = async (path) => {
  const res = await realFetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
};

test("nearby returns live gyms sorted by distance, including ways", async () => {
  const { status, body } = await get(`/gyms/nearby?${NEAR}&radius=5`);
  assert.equal(status, 200);
  assert.equal(body.dataSource, "osm");
  assert.deepEqual(body.gyms.map((g) => g.id), ["osm-node-1", "osm-way-2"]);

  const [first, second] = body.gyms;
  assert.equal(first.name, "Always Open");
  assert.equal(first.openNow, true);
  assert.deepEqual(first.amenities, ["Fitness center", "Fitness", "Yoga"]);
  assert.ok(first.distanceKm < second.distanceKm);
  assert.equal(second.name, "Big Brand");
  assert.equal(second.openNow, null);
  assert.equal(second.hours.unknown, true);
  assert.ok(second.amenities.includes("Wheelchair accessible"));
  assert.equal("schedule" in first.hours, false);
});

test("unnamed gyms get a readable name", async () => {
  overpassHandler = async () => okJson([{ type: "node", id: 9, lat: 36.8, lon: 10.18, tags: { leisure: "fitness_centre" } }]);
  const { body } = await get(`/gyms/nearby?${NEAR}`);
  assert.equal(body.gyms[0].name, "Fitness center");
});

test("openNow=true keeps only gyms known to be open", async () => {
  const { body } = await get(`/gyms/nearby?${NEAR}&radius=5&openNow=true`);
  assert.deepEqual(body.gyms.map((g) => g.id), ["osm-node-1"]);
});

test("a bigger radius includes farther gyms", async () => {
  const { body } = await get(`/gyms/nearby?${NEAR}&radius=25`);
  assert.equal(body.gyms.length, 3);
});

test("the radius is capped", async () => {
  await get(`/gyms/nearby?${NEAR}&radius=5000`);
  assert.match(overpassBodies[0], /around:25000,/);
});

test("results are cached between requests", async () => {
  await get(`/gyms/nearby?${NEAR}`);
  await get(`/gyms/nearby?${NEAR}`);
  assert.equal(overpassCalls, 1);
});

test("a transient Overpass failure is retried once", async () => {
  let attempt = 0;
  overpassHandler = async () => (++attempt === 1 ? failing() : okJson(ELEMENTS));
  const { body } = await get(`/gyms/nearby?${NEAR}`);
  assert.equal(body.dataSource, "osm");
  assert.equal(overpassCalls, 2);
});

test("falls back to the sample dataset when Overpass is down", async () => {
  overpassHandler = failing;
  const { status, body } = await get("/gyms/nearby?lat=37.7749&lng=-122.4194");
  assert.equal(status, 200);
  assert.equal(body.dataSource, "fallback");
  assert.ok(body.gyms.length > 0);
  assert.ok(body.gyms.every((g) => g.source === "fallback"));
});

test("an empty live result is returned as-is, not replaced by sample data", async () => {
  overpassHandler = async () => okJson([]);
  const { body } = await get(`/gyms/nearby?${NEAR}`);
  assert.equal(body.dataSource, "osm");
  assert.equal(body.count, 0);
});

test("rejects missing or out-of-range coordinates", async () => {
  assert.equal((await get("/gyms/nearby")).status, 400);
  assert.equal((await get("/gyms/nearby?lat=abc&lng=1")).status, 400);
  assert.equal((await get("/gyms/nearby?lat=95&lng=1")).status, 400);
  assert.equal(overpassCalls, 0);
});

test("gym detail: sample gyms, unknown ids and malformed OSM ids", async () => {
  const known = await get("/gyms/golds-gym");
  assert.equal(known.status, 200);
  assert.equal(known.body.name, "Gold's Gym");
  assert.equal(typeof known.body.openNow, "boolean");

  assert.equal((await get("/gyms/nope")).status, 404);

  // must never reach Overpass: the id would otherwise be spliced into the query
  const bad = await get("/gyms/osm-1);out;");
  assert.equal(bad.status, 400);
  assert.equal(overpassCalls, 0);
});

test("gym detail resolves OSM ids, including the legacy node form", async () => {
  overpassHandler = async () => okJson([ELEMENTS[1]]);
  const way = await get("/gyms/osm-way-2");
  assert.equal(way.status, 200);
  assert.equal(way.body.id, "osm-way-2");

  overpassHandler = async () => okJson([ELEMENTS[0]]);
  const legacy = await get("/gyms/osm-1");
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.name, "Always Open");

  overpassHandler = async () => okJson([]);
  assert.equal((await get("/gyms/osm-node-999")).status, 404);
});

test("gyms carry no rating fields: ratings belong to the review service", async () => {
  const { body } = await get(`/gyms/nearby?${NEAR}&radius=5`);
  assert.ok(body.gyms.length > 0);
  assert.ok(body.gyms.every((g) => !("reviewCount" in g) && !("averageRating" in g)));

  const detail = await get("/gyms/golds-gym");
  assert.equal("reviewCount" in detail.body, false);
});

test("health check and unknown routes", async () => {
  const health = await get("/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { service: "gym-service", status: "ok" });

  const missing = await get("/nope");
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "not found" });
});
