const express = require("express");
const cors = require("cors");
const reviewsRouter = require("./routes/reviews");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ service: "review-service", status: "ok" });
});

app.use("/reviews", reviewsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

// malformed JSON bodies, etc.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "internal server error" : err.message });
});

if (require.main === module) {
  const PORT = process.env.PORT || 4102;
  app.listen(PORT, () => console.log(`review-service listening on ${PORT}`));
}

module.exports = app;
