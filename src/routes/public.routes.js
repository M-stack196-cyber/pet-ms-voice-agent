const express = require("express");

const {
  getBookingDraftByToken,
  completeBookingDraft,
} = require("../services/bookingDraft.service");

const router = express.Router();

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPage(title, body) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${escapeHtml(title)}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 30px 16px;
            background: #f4f6f2;
            color: #1d2a22;
            font-family: Arial, sans-serif;
          }

          .container {
            width: 100%;
            max-width: 720px;
            margin: 0 auto;
            padding: 30px;
            background: white;
            border-radius: 18px;
            box-shadow: 0 15px 45px rgba(0, 0, 0, 0.08);
          }

          h1 {
            margin-top: 0;
          }

          .summary {
            padding: 18px;
            margin-bottom: 24px;
            background: #eef4ec;
            border-radius: 12px;
          }

          .summary p {
            margin: 8px 0;
          }

          label {
            display: block;
            margin-top: 16px;
            margin-bottom: 6px;
            font-weight: bold;
          }

          input,
          textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #ccd5cb;
            border-radius: 9px;
            font: inherit;
          }

          textarea {
            min-height: 100px;
            resize: vertical;
          }

          button {
            width: 100%;
            margin-top: 22px;
            padding: 14px;
            border: 0;
            border-radius: 10px;
            background: #294936;
            color: white;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
          }

          .notice {
            color: #56645b;
            line-height: 1.5;
          }
        </style>
      </head>

      <body>
        <main class="container">
          ${body}
        </main>
      </body>
    </html>
  `;
}

router.get("/complete-booking/:token", async (req, res) => {
  const draft = await getBookingDraftByToken(req.params.token);

  if (!draft) {
    return res.status(404).send(
      renderPage(
        "Booking not found",
        `
          <h1>Booking link not found</h1>
          <p>This booking link is invalid.</p>
        `
      )
    );
  }

  if (new Date(draft.expiresAt) <= new Date()) {
    draft.status = "expired";

    return res.status(410).send(
      renderPage(
        "Booking link expired",
        `
          <h1>This booking link has expired</h1>
          <p>Please call the facility to request a new booking link.</p>
        `
      )
    );
  }

  if (draft.status === "form_completed") {
    return res.send(
      renderPage(
        "Booking details submitted",
        `
          <h1>Details already submitted</h1>
          <p>Your booking reference is <strong>${escapeHtml(
            draft.id
          )}</strong>.</p>
        `
      )
    );
  }

  return res.send(
    renderPage(
      "Complete your Pet-MS booking",
      `
        <h1>Complete your booking</h1>

        <p class="notice">
          We collected the main booking information during your call.
          Please complete the remaining pet details below.
        </p>

        <section class="summary">
          <p>
            <strong>Reference:</strong>
            ${escapeHtml(draft.id)}
          </p>

          <p>
            <strong>Customer:</strong>
            ${escapeHtml(draft.customer.name)}
          </p>

          <p>
            <strong>Facility:</strong>
            ${escapeHtml(draft.facility.name)}
          </p>

          <p>
            <strong>Service:</strong>
            ${escapeHtml(draft.service.name)}
          </p>

          <p>
            <strong>Accommodation:</strong>
            ${escapeHtml(draft.accommodation.name)}
          </p>

          <p>
            <strong>Dates:</strong>
            ${escapeHtml(draft.stay.dropOffDate)}
            to
            ${escapeHtml(draft.stay.collectionDate)}
          </p>

          <p>
            <strong>Pets:</strong>
            ${escapeHtml(draft.pets.count)}
          </p>

          <p>
            <strong>Total:</strong>
            ${escapeHtml(draft.quote.currency)}
            ${escapeHtml(draft.quote.total)}
          </p>

          <p>
            <strong>Deposit:</strong>
            ${escapeHtml(draft.quote.currency)}
            ${escapeHtml(draft.quote.deposit)}
          </p>
        </section>

        <form
          method="POST"
          action="/complete-booking/${escapeHtml(draft.token)}"
        >
          <label for="breed">Pet breed</label>
          <input id="breed" name="breed" required />

          <label for="age">Pet age</label>
          <input id="age" name="age" required />

          <label for="feedingInstructions">
            Feeding instructions
          </label>

          <textarea
            id="feedingInstructions"
            name="feedingInstructions"
          ></textarea>

          <label for="specialNotes">
            Medication, allergies, behaviour, or special notes
          </label>

          <textarea
            id="specialNotes"
            name="specialNotes"
          ></textarea>

          <button type="submit">
            Submit booking details
          </button>
        </form>
      `
    )
  );
});

router.post("/complete-booking/:token", async (req, res) => {
  try {
    const draft = await completeBookingDraft(
      req.params.token,
      req.body
    );

    return res.send(
      renderPage(
        "Booking details submitted",
        `
          <h1>Thank you</h1>

          <p>
            Your pet details were submitted successfully.
          </p>

          <p>
            Your booking reference is
            <strong>${escapeHtml(draft.id)}</strong>.
          </p>

          <p class="notice">
            This sandbox demo does not collect a real payment.
            Staff can now review the booking draft.
          </p>
        `
      )
    );
  } catch (error) {
    return res.status(error.statusCode || 500).send(
      renderPage(
        "Unable to complete booking",
        `
          <h1>Unable to complete booking</h1>
          <p>${escapeHtml(error.message)}</p>
        `
      )
    );
  }
});

module.exports = router;