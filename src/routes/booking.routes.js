const express = require("express");

const {
  createBookingDraft,
  getBookingDraftByToken,
  updateBookingDraft,
  cancelBookingDraft,
} = require("../services/bookingDraft.service");

const {
  sendMockSms,
} = require("../services/sms.service");

const router = express.Router();

router.post("/create-booking-draft", async (req, res) => {
  try {
    const bookingDraft = await createBookingDraft(req.body);

    const smsDelivery = sendMockSms({
      to: bookingDraft.customer.phoneNumber,
      bookingDraft,
    });

    return res.status(201).json({
      success: true,
      message: "Booking draft created and sandbox SMS prepared successfully.",
      data: {
        ...bookingDraft,
        smsDelivery,
      },
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


router.patch("/booking-drafts/:id", (req, res) => {
  try {
    const bookingDraft = updateBookingDraft(
      req.params.id,
      req.body || {}
    );

    return res.status(200).json({
      success: true,
      message: "Booking draft updated successfully.",
      data: bookingDraft,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code:
        error.code ||
        "BOOKING_DRAFT_UPDATE_FAILED",
      message:
        error.message ||
        "The booking draft could not be updated.",
    });
  }
});

router.post(
  "/booking-drafts/:id/cancel",
  (req, res) => {
    try {
      const bookingDraft = cancelBookingDraft(
        req.params.id,
        (req.body || {}).reason
      );

      return res.status(200).json({
        success: true,
        message:
          "Booking draft cancelled successfully.",
        data: bookingDraft,
      });
    } catch (error) {
      return res
        .status(error.statusCode || 500)
        .json({
          success: false,
          code:
            error.code ||
            "BOOKING_DRAFT_CANCELLATION_FAILED",
          message:
            error.message ||
            "The booking draft could not be cancelled.",
        });
    }
  }
);

module.exports = router;
