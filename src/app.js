const express = require("express");
const cors = require("cors");

const voiceRoutes = require("./routes/voice.routes");
const bookingRoutes = require("./routes/booking.routes");
const publicRoutes = require("./routes/public.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Pet-MS Voice Agent API is running",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/voice", voiceRoutes);
app.use("/api/voice", bookingRoutes);
app.use("/", publicRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    code: "ROUTE_NOT_FOUND",
    message: "The requested API route does not exist.",
  });
});

module.exports = app;