const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// The gateway is tested against fake gym and review services, so every failure
// mode (down, slow, garbage) can be produced on demand.
let gymServer;
let reviewServer;
let gatewayServer;
let base;
let gymHandler;
let reviewHandler;
let seen;

const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

function fakeService(name, handler) {
  return http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    seen.push({ service: name, method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
    handler()(req, res);
  });
}

const listen = (server) =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));

before(async () => {
  gymServer = fakeService("gym", () => gymHandler);
  reviewServer = fakeService("review", () => reviewHandler);
  process.env.GYM_SERVICE_URL = await listen(gymServer);
  process.env.REVIEW_SERVICE_URL = await listen(reviewServer);
  process.env.GYM_TIMEOUT_MS = "400";
  process.env.REVIEW_TIMEOUT_MS = "300";
  process.env.HEALTH_TIMEOUT_MS = "300";

  const app = require("../src/server"); // after the env vars, so the config picks them up
  gatewayServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => gatewayServer.once("listening", resolve));
  base = `http://127.0.0.1:${gatewayServer.address().port}`;
});

after(() => {
  for (const server of [gatewayServer, gymServer, reviewServer]) {
    server.closeAllConnections?.();
    server.close();
  }
});

const GYMS = [
  { id: "osm-node-1", name: "Reviewed", distanceKm: 0.4, openNow: true },
  { id: "osm-node-2", name: "Unreviewed", distanceKm: 0.9, openNow: null },
];
const RATINGS = { "osm-node-1": { count: 3, average: 4.3 } };

beforeEach(() => {
  seen = [];
  gymHandler = (req, res) => {
    if (req.url.startsWith("/health")) return json(res, 200, { service: "gym-service", status: "ok" });
    if (req.url.startsWith("/gyms/nearby")) return json(res, 200, { dataSource: "osm", count: GYMS.length, gyms: GYMS });
    const id = decodeURIComponent(req.url.replace("/gyms/", ""));
    const gym = GYMS.find((g) => g.id === id);
    return gym ? json(res, 200, gym) : json(res, 404, { error: "gym not found" });
  };
  reviewHandler = (req, res) => {
    if (req.url === "/health") return json(res, 200, { service: "review-service", status: "ok" });
    if (req.url === "/reviews/ratings") return json(res, 200, RATINGS);
    if (req.url.startsWith("/reviews/gym/")) return json(res, 200, { gymId: "osm-node-1", count: 3, average: 4.3, reviews: [] });
    if (req.method === "POST" && req.url === "/reviews") return json(res, 201, { id: "r1", ...seen.at(-1).body });
    return json(res, 404, { error: "not found" });
  };
});

const request = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const seenBy = (service) => seen.filter((r) => r.service === service);

test("nearby composes the gym list with ratings from the review service", async () => {
  const { status, body } = await request("GET", "/api/gyms/nearby?lat=1&lng=2&radius=3");
  assert.equal(status, 200);
  assert.equal(body.dataSource, "osm");
  assert.equal(body.count, 2);
  assert.deepEqual(
    body.gyms.map((g) => [g.id, g.reviewCount, g.averageRating]),
    [["osm-node-1", 3, 4.3], ["osm-node-2", 0, null]]
  );
  assert.equal(body.gyms[0].name, "Reviewed", "the gym fields are kept");
});

test("ratings are fetched once per search, not once per gym", async () => {
  await request("GET", "/api/gyms/nearby?lat=1&lng=2");
  assert.equal(seenBy("review").length, 1);
  assert.equal(seenBy("review")[0].url, "/reviews/ratings");
});

test("only the known search parameters are forwarded to the gym service", async () => {
  await request("GET", "/api/gyms/nearby?lat=1&lng=2&radius=3&openNow=true&evil=1");
  assert.equal(seenBy("gym")[0].url, "/gyms/nearby?lat=1&lng=2&radius=3&openNow=true");
});

test("an ambiguous repeated parameter is dropped, so the gym service rejects the request", async () => {
  gymHandler = (req, res) => json(res, 400, { error: "lat and lng query params are required" });
  const { status } = await request("GET", "/api/gyms/nearby?lat=1&lat=9&lng=2");
  assert.equal(status, 400);
  assert.equal(seenBy("gym")[0].url, "/gyms/nearby?lng=2");
});

test("a gym service error is passed through with its status", async () => {
  gymHandler = (req, res) => json(res, 400, { error: "lat and lng query params are required" });
  const { status, body } = await request("GET", "/api/gyms/nearby");
  assert.equal(status, 400);
  assert.deepEqual(body, { error: "lat and lng query params are required" });
});

test("gym detail carries the rating, and the id is encoded on the way through", async () => {
  const ok = await request("GET", "/api/gyms/osm-node-1");
  assert.equal(ok.status, 200);
  assert.equal(ok.body.reviewCount, 3);
  assert.equal(ok.body.averageRating, 4.3);

  await request("GET", `/api/gyms/${encodeURIComponent("osm-1);out;")}`);
  assert.equal(seenBy("gym").at(-1).url, "/gyms/osm-1)%3Bout%3B");

  const missing = await request("GET", "/api/gyms/nope");
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "gym not found" });
});

test("searches still work without ratings when the review service fails", async () => {
  const failures = [
    (req) => req.socket.destroy(), // connection dropped
    (req, res) => json(res, 500, { error: "boom" }),
    (req, res) => { res.writeHead(200); res.end("<html>not json</html>"); },
    () => {}, // never answers: hits the review timeout
  ];
  for (const failure of failures) {
    reviewHandler = failure;
    const started = Date.now();
    const { status, body } = await request("GET", "/api/gyms/nearby?lat=1&lng=2");
    assert.equal(status, 200);
    assert.equal(body.count, 2);
    assert.ok(body.gyms.every((g) => g.reviewCount === 0 && g.averageRating === null));
    assert.ok(Date.now() - started < 2000, "a slow review service must not stall the search");
  }
});

test("a gym service that is down or slow becomes a 502 or 504", async () => {
  gymHandler = (req) => req.socket.destroy();
  const down = await request("GET", "/api/gyms/nearby?lat=1&lng=2");
  assert.equal(down.status, 502);
  assert.deepEqual(down.body, { error: "gym-service unavailable" });

  gymHandler = () => {}; // never answers
  const slow = await request("GET", "/api/gyms/osm-node-1");
  assert.equal(slow.status, 504);
  assert.deepEqual(slow.body, { error: "gym-service unavailable" });
});

test("reviews are read through the gateway", async () => {
  const { status, body } = await request("GET", "/api/reviews/gym/osm-node-1");
  assert.equal(status, 200);
  assert.equal(body.count, 3);
  assert.equal(seenBy("review")[0].url, "/reviews/gym/osm-node-1");
});

test("a review is forwarded to the review service and its answer returned", async () => {
  const review = { gymId: "osm-node-1", author: "Sam", rating: 5, comment: "Great." };
  const { status, body } = await request("POST", "/api/reviews", review);
  assert.equal(status, 201);
  assert.equal(body.author, "Sam");
  assert.deepEqual(seenBy("review")[0].body, review);
});

test("the review service's validation errors reach the client", async () => {
  reviewHandler = (req, res) => json(res, 400, { error: "rating must be an integer from 1 to 5" });
  const { status, body } = await request("POST", "/api/reviews", { gymId: "a", author: "b", rating: 9, comment: "c" });
  assert.equal(status, 400);
  assert.match(body.error, /rating/);
});

test("reviews cannot be read or written while the review service is down", async () => {
  reviewHandler = (req) => req.socket.destroy();
  const read = await request("GET", "/api/reviews/gym/osm-node-1");
  assert.equal(read.status, 502);
  assert.deepEqual(read.body, { error: "review-service unavailable" });

  const write = await request("POST", "/api/reviews", { gymId: "a", author: "b", rating: 5, comment: "c" });
  assert.equal(write.status, 502);
});

test("malformed JSON is rejected by the gateway without bothering the review service", async () => {
  const { status, body } = await request("POST", "/api/reviews", "{not json");
  assert.equal(status, 400);
  assert.ok(body.error);
  assert.equal(seenBy("review").length, 0);
});

test("health reports every service, and degrades to 503 when one is down", async () => {
  const up = await request("GET", "/api/health");
  assert.equal(up.status, 200);
  assert.deepEqual(up.body, {
    service: "gateway",
    status: "ok",
    services: { "gym-service": "ok", "review-service": "ok" },
  });

  reviewHandler = (req) => req.socket.destroy();
  const degraded = await request("GET", "/api/health");
  assert.equal(degraded.status, 503);
  assert.equal(degraded.body.status, "degraded");
  assert.deepEqual(degraded.body.services, { "gym-service": "ok", "review-service": "down" });
});

test("unknown routes return a JSON 404", async () => {
  const { status, body } = await request("GET", "/api/nope");
  assert.equal(status, 404);
  assert.deepEqual(body, { error: "not found" });
});
