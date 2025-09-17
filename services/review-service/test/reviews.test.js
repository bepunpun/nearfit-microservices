const fs = require("fs");
const os = require("os");
const path = require("path");

const REVIEWS_FILE = path.join(os.tmpdir(), `nearfit-review-service-test-${process.pid}.json`);
process.env.REVIEWS_FILE = REVIEWS_FILE;

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/server");

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(REVIEWS_FILE, { force: true });
});

// start every test from the tracked seed data
beforeEach(() => {
  fs.rmSync(REVIEWS_FILE, { force: true });
});

const request = async (method, url, body) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const valid = { gymId: "osm-node-7", author: "Sam", rating: 4, comment: "Clean and quiet." };

test("seed reviews are served with a count and average", async () => {
  const { status, body } = await request("GET", "/reviews/gym/golds-gym");
  assert.equal(status, 200);
  assert.equal(body.gymId, "golds-gym");
  assert.ok(body.count > 0);
  assert.equal(body.reviews.length, body.count);
  assert.ok(body.average >= 1 && body.average <= 5);
  const dates = body.reviews.map((r) => r.createdAt);
  assert.deepEqual(dates, [...dates].sort().reverse(), "newest first");
});

test("a gym with no reviews has count 0 and no average", async () => {
  const { body } = await request("GET", "/reviews/gym/nobody-reviewed-this");
  assert.deepEqual(body, { gymId: "nobody-reviewed-this", count: 0, average: null, reviews: [] });
});

test("submitting a review stores it and it shows up in the summary", async () => {
  const created = await request("POST", "/reviews", { ...valid, author: "  Sam  " });
  assert.equal(created.status, 201);
  assert.equal(created.body.author, "Sam");
  assert.equal(created.body.rating, 4);
  assert.ok(created.body.id && created.body.createdAt);

  await request("POST", "/reviews", { ...valid, rating: "5", comment: "Great." });
  const { body } = await request("GET", "/reviews/gym/osm-node-7");
  assert.equal(body.count, 2);
  assert.equal(body.average, 4.5);
  assert.equal(body.reviews[0].comment, "Great."); // newest first
});

test("the seed file is never modified", async () => {
  const seedPath = path.join(__dirname, "..", "src", "data", "reviews.seed.json");
  const before = fs.readFileSync(seedPath, "utf-8");
  await request("POST", "/reviews", valid);
  assert.equal(fs.readFileSync(seedPath, "utf-8"), before);
});

test("ratings gives count and average for every reviewed gym in one call", async () => {
  await request("POST", "/reviews", valid);
  await request("POST", "/reviews", { ...valid, rating: 5 });

  const { status, body } = await request("GET", "/reviews/ratings");
  assert.equal(status, 200);
  assert.deepEqual(body["osm-node-7"], { count: 2, average: 4.5 });
  assert.ok(body["golds-gym"].count > 0, "seed reviews are included");
  assert.equal("nobody-reviewed-this" in body, false);
});

test("invalid reviews are rejected and nothing is stored", async () => {
  const bad = [
    {},
    { ...valid, gymId: "" },
    { ...valid, author: "   " },
    { ...valid, comment: "" },
    { ...valid, rating: 0 },
    { ...valid, rating: 6 },
    { ...valid, rating: 3.5 },
    { ...valid, rating: "great" },
    { ...valid, author: "x".repeat(41) },
    { ...valid, comment: "x".repeat(501) },
    { ...valid, author: { $ne: 1 } },
  ];
  for (const payload of bad) {
    const { status } = await request("POST", "/reviews", payload);
    assert.equal(status, 400, JSON.stringify(payload));
  }
  const { body } = await request("GET", "/reviews/gym/osm-node-7");
  assert.equal(body.count, 0);
});

test("malformed JSON is a 400, not a crash", async () => {
  const { status, body } = await request("POST", "/reviews", "{not json");
  assert.equal(status, 400);
  assert.ok(body.error);
});

test("health check and unknown routes", async () => {
  const health = await request("GET", "/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { service: "review-service", status: "ok" });

  const missing = await request("GET", "/nope");
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "not found" });
});
