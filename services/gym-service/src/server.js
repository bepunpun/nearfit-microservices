const express = require("express");
const cors = require("cors");
const gymsRouter = require("./routes/gyms");

const app = express();
app.use(cors());

app.get("/health", (req, res) => {
  res.json({ service: "gym-service", status: "ok" });
});

app.use("/gyms", gymsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

if (require.main === module) {
  const PORT = process.env.PORT || 4101;
  app.listen(PORT, () => console.log(`gym-service listening on ${PORT}`));
}

module.exports = app;
