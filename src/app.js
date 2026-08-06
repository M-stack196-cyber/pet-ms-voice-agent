const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const voiceRoutes = require("./routes/voice.routes");
const bookingRoutes = require("./routes/booking.routes");
const publicRoutes = require("./routes/public.routes");
const vapiRoutes = require("./routes/vapi.routes");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    // The current secure booking page uses inline styling.
    contentSecurityPolicy: false,
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Please try again later.",
  },
});

const bookingFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many booking-form requests. Please try again later.",
});

app.use("/api", apiLimiter);
app.use("/complete-booking", bookingFormLimiter);

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
app.use("/api/voice", vapiRoutes);
app.use("/", publicRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    code: "ROUTE_NOT_FOUND",
    message: "The requested API route does not exist.",
  });
});

module.exports = app;