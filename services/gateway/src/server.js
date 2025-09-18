const express = require("express");
const cors = require("cors");
const config = require("./config");
const { UpstreamError } = require("./lib/upstream");
const healthRouter = require("./routes/health");
const gymsRouter = require("./routes/gyms");
const reviewsRouter = require("./routes/reviews");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/gyms", gymsRouter);
app.use("/api/reviews", reviewsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof UpstreamError) {
    console.warn(err.message);
    return res.status(err.status).json({ error: `${err.service} unavailable` });
  }
  // malformed JSON bodies, etc.
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "internal server error" : err.message });
});

if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`gateway listening on ${config.PORT}`);
    console.log(`  -> gym-service    ${config.GYM_SERVICE_URL}`);
    console.log(`  -> review-service ${config.REVIEW_SERVICE_URL}`);
  });
}

module.exports = app;
