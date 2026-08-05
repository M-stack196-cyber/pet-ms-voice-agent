const express = require("express");

const {
  createBookingDraft,
  getBookingDraftByToken,
} = require("../services/bookingDraft.service");

const router = express.Router();

router.post("/create-booking-draft", (req, res) => {
  try {
    const bookingDraft = createBookingDraft(req.body);

    return res.status(201).json({
      success: true,
      message: "Booking draft created successfully.",
      data: bookingDraft,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "BOOKING_DRAFT_CREATION_FAILED",
      message:
        error.message || "The booking draft could not be created.",
    });
  }
});

router.get("/booking-draft/:token", (req, res) => {
  const bookingDraft = getBookingDraftByToken(req.params.token);

  if (!bookingDraft) {
    return res.status(404).json({
      success: false,
      code: "BOOKING_DRAFT_NOT_FOUND",
      message: "The booking draft was not found.",
    });
  }

  return res.status(200).json({
    success: true,
    data: bookingDraft,
  });
});

module.exports = router;