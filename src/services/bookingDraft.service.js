const crypto = require("crypto");

const facilities = require("../data/facilities");
const bookingDrafts = require("../data/bookings");

function createError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}


function toCents(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw createError(
      500,
      "INVALID_MONEY_VALUE",
      "An invalid monetary value was encountered."
    );
  }

  return Math.round((numericValue + 1e-9) * 100);
}

function fromCents(cents) {
  return cents / 100;
}

function applyRateToCents(amountCents, rate) {
  const numericRate = Number(rate);

  if (!Number.isFinite(numericRate) || numericRate < 0) {
    throw createError(
      500,
      "INVALID_RATE",
      "An invalid pricing rate was encountered."
    );
  }

  const rateText = String(numericRate);

  if (rateText.includes("e")) {
    return Math.round(amountCents * numericRate);
  }

  const [wholePart, decimalPart = ""] = rateText.split(".");
  const denominator = 10 ** decimalPart.length;

  const numerator =
    Number(wholePart) * denominator +
    Number(decimalPart || 0);

  return Math.round(
    (amountCents * numerator) / denominator
  );
}

function parseDate(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw createError(400, "MISSING_DATE", `${fieldName} is required.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw createError(
      400,
      "INVALID_DATE",
      `${fieldName} must use YYYY-MM-DD format.`
    );
  }

  return date;
}

function datesOverlap(requestStart, requestEnd, existingStart, existingEnd) {
  return requestStart < existingEnd && requestEnd > existingStart;
}

function normalizePhoneNumber(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    throw createError(
      400,
      "PHONE_NUMBER_REQUIRED",
      "phoneNumber is required."
    );
  }

  let phoneNumber = rawValue.replace(/[\s().-]/g, "");

  if (phoneNumber.startsWith("00")) {
    phoneNumber = `+${phoneNumber.slice(2)}`;
  }

  // Pakistani local mobile number: 03287207195
  if (/^03\d{9}$/.test(phoneNumber)) {
    return `+92${phoneNumber.slice(1)}`;
  }

  // Pakistani international number without plus: 923287207195
  if (/^923\d{9}$/.test(phoneNumber)) {
    return `+${phoneNumber}`;
  }

  // Valid international E.164 number
  if (/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    return phoneNumber;
  }

  throw createError(
    400,
    "INVALID_PHONE_NUMBER",
    "Provide a valid phone number. Pakistani numbers may use 03XXXXXXXXX or +923XXXXXXXXX."
  );
}

function normalizePetNames(petNames) {
  if (Array.isArray(petNames)) {
    return petNames
      .map((name) => String(name).trim())
      .filter(Boolean);
  }

  if (typeof petNames === "string") {
    return petNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  return [];
}

function getBookingContext(payload) {
  const {
    facilityId,
    serviceId,
    accommodationId,
    petType,
    petCount,
    dropOffDate,
    collectionDate,
  } = payload;

  const parsedPetCount = Number(petCount);

  if (
    !Number.isInteger(parsedPetCount) ||
    parsedPetCount < 1 ||
    parsedPetCount > 10
  ) {
    throw createError(
      400,
      "INVALID_PET_COUNT",
      "petCount must be between 1 and 10."
    );
  }

  const facility = facilities.find((item) => item.id === facilityId);

  if (!facility) {
    throw createError(
      404,
      "FACILITY_NOT_FOUND",
      "The selected facility was not found."
    );
  }

  const service = facility.services.find((item) => item.id === serviceId);

  if (!service) {
    throw createError(
      404,
      "SERVICE_NOT_FOUND",
      "The selected service was not found."
    );
  }

  const accommodation = facility.accommodations.find(
    (item) => item.id === accommodationId
  );

  if (!accommodation) {
    throw createError(
      404,
      "ACCOMMODATION_NOT_FOUND",
      "The selected accommodation was not found."
    );
  }

  if (
    service.petType !== petType ||
    accommodation.petType !== petType
  ) {
    throw createError(
      400,
      "PET_TYPE_MISMATCH",
      "The service or accommodation does not support this pet type."
    );
  }

  const parsedDropOffDate = parseDate(dropOffDate, "dropOffDate");
  const parsedCollectionDate = parseDate(
    collectionDate,
    "collectionDate"
  );

  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  const nights = Math.ceil(
    (parsedCollectionDate.getTime() -
      parsedDropOffDate.getTime()) /
      millisecondsPerDay
  );

  if (nights < 1) {
    throw createError(
      400,
      "INVALID_DATE_RANGE",
      "collectionDate must be after dropOffDate."
    );
  }

  if (nights < service.minimumNights) {
    throw createError(
      400,
      "MINIMUM_STAY_NOT_MET",
      `${service.name} requires at least ${service.minimumNights} nights.`
    );
  }

  return {
    facility,
    service,
    accommodation,
    petType,
    petCount: parsedPetCount,
    dropOffDate,
    collectionDate,
    parsedDropOffDate,
    parsedCollectionDate,
    nights,
  };
}

function getAvailableUnits(context) {
  const staticReservedUnits =
    context.accommodation.reservations.reduce(
      (total, reservation) => {
        const reservationStart = new Date(
          `${reservation.from}T00:00:00.000Z`
        );

        const reservationEnd = new Date(
          `${reservation.to}T00:00:00.000Z`
        );

        const overlaps = datesOverlap(
          context.parsedDropOffDate,
          context.parsedCollectionDate,
          reservationStart,
          reservationEnd
        );

        return overlaps ? total + reservation.units : total;
      },
      0
    );

  const now = new Date();

  const activeVoiceHolds = bookingDrafts.filter((draft) => {
    if (
      draft.status !== "draft_created" ||
      new Date(draft.expiresAt) <= now
    ) {
      return false;
    }

    if (
      draft.facility.id !== context.facility.id ||
      draft.accommodation.id !== context.accommodation.id
    ) {
      return false;
    }

    const draftStart = new Date(
      `${draft.stay.dropOffDate}T00:00:00.000Z`
    );

    const draftEnd = new Date(
      `${draft.stay.collectionDate}T00:00:00.000Z`
    );

    return datesOverlap(
      context.parsedDropOffDate,
      context.parsedCollectionDate,
      draftStart,
      draftEnd
    );
  }).length;

  return Math.max(
    context.accommodation.capacity -
      staticReservedUnits -
      activeVoiceHolds,
    0
  );
}

function calculateQuote(context) {
  const additionalPets = Math.max(
    context.petCount - 1,
    0
  );

  const baseNightlyRateCents = toCents(
    context.accommodation.baseNightlyRate
  );

  const serviceNightlyAdjustmentCents = toCents(
    context.service.nightlyAdjustment
  );

  const additionalPetRateCents = toCents(
    context.accommodation.additionalPetNightlyRate
  );

  const additionalPetNightlyTotalCents =
    additionalPets * additionalPetRateCents;

  const nightlyTotalCents =
    baseNightlyRateCents +
    serviceNightlyAdjustmentCents +
    additionalPetNightlyTotalCents;

  const subtotalCents =
    nightlyTotalCents * context.nights;

  const taxCents = applyRateToCents(
    subtotalCents,
    context.facility.taxRate
  );

  const totalCents =
    subtotalCents + taxCents;

  const depositCents = applyRateToCents(
    totalCents,
    context.facility.depositRate
  );

  const remainingBalanceCents =
    totalCents - depositCents;

  return {
    currency: context.facility.currency,
    baseNightlyRate: fromCents(baseNightlyRateCents),
    serviceNightlyAdjustment: fromCents(
      serviceNightlyAdjustmentCents
    ),
    additionalPetNightlyTotal: fromCents(
      additionalPetNightlyTotalCents
    ),
    nightlyTotal: fromCents(nightlyTotalCents),
    subtotal: fromCents(subtotalCents),
    tax: fromCents(taxCents),
    total: fromCents(totalCents),
    deposit: fromCents(depositCents),
    remainingBalance: fromCents(
      remainingBalanceCents
    ),
  };
}

function createBookingDraft(payload) {
  const customerName = String(payload.customerName || "").trim();
  const phoneNumber = normalizePhoneNumber(
    payload.phoneNumber
  );

  const email = String(payload.email || "").trim();

  if (!customerName) {
    throw createError(
      400,
      "CUSTOMER_NAME_REQUIRED",
      "customerName is required."
    );
  }

  const context = getBookingContext(payload);
  const availableUnits = getAvailableUnits(context);

  if (availableUnits < 1) {
    throw createError(
      409,
      "NO_AVAILABILITY",
      "The selected accommodation is no longer available."
    );
  }

  const quote = calculateQuote(context);
  const petNames = normalizePetNames(payload.petNames);

  const id = `PM-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

  const token = crypto.randomBytes(24).toString("hex");

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);

  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3000";

  const bookingDraft = {
    id,
    token,
    status: "draft_created",
    source: "voice",

    customer: {
      name: customerName,
      phoneNumber,
      email: email || null,
    },

    pets: {
      type: context.petType,
      count: context.petCount,
      names: petNames,
    },

    facility: {
      id: context.facility.id,
      name: context.facility.name,
    },

    service: {
      id: context.service.id,
      name: context.service.name,
    },

    accommodation: {
      id: context.accommodation.id,
      name: context.accommodation.name,
    },

    stay: {
      dropOffDate: context.dropOffDate,
      collectionDate: context.collectionDate,
      nights: context.nights,
    },

    quote,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),

    completionUrl: `${publicBaseUrl}/complete-booking/${token}`,
  };

  bookingDrafts.push(bookingDraft);

  return bookingDraft;
}

function getBookingDraftByToken(token) {
  return bookingDrafts.find((draft) => draft.token === token);
}

function completeBookingDraft(token, details) {
  const draft = getBookingDraftByToken(token);

  if (!draft) {
    throw createError(
      404,
      "BOOKING_DRAFT_NOT_FOUND",
      "The booking draft was not found."
    );
  }

  if (new Date(draft.expiresAt) <= new Date()) {
    draft.status = "expired";

    throw createError(
      410,
      "BOOKING_DRAFT_EXPIRED",
      "The booking link has expired."
    );
  }

  if (draft.status === "form_completed") {
    throw createError(
      409,
      "BOOKING_DRAFT_ALREADY_COMPLETED",
      "This booking form has already been submitted."
    );
  }

  if (
    ["cancelled", "replaced", "completed"]
      .includes(draft.status)
  ) {
    throw createError(
      409,
      "BOOKING_DRAFT_NOT_COMPLETABLE",
      `A booking draft with status ${draft.status} cannot be completed.`
    );
  }

  if (draft.status !== "draft_created") {
    throw createError(
      409,
      "BOOKING_DRAFT_NOT_COMPLETABLE",
      "This booking draft cannot be completed."
    );
  }

  const breed = String(
    details.breed || ""
  ).trim();

  const age = String(
    details.age || ""
  ).trim();

  if (!breed) {
    throw createError(
      400,
      "PET_BREED_REQUIRED",
      "Pet breed is required."
    );
  }

  if (!age) {
    throw createError(
      400,
      "PET_AGE_REQUIRED",
      "Pet age is required."
    );
  }

  draft.petDetails = {
    breed,
    age,

    feedingInstructions: String(
      details.feedingInstructions || ""
    ).trim(),

    specialNotes: String(
      details.specialNotes || ""
    ).trim(),
  };

  draft.status = "form_completed";
  draft.completedAt = new Date().toISOString();
  draft.tokenUsedAt = draft.completedAt;
  draft.updatedAt = draft.completedAt;

  return draft;
}


function getBookingDraftById(id) {
  const normalizedId = String(id || "")
    .trim()
    .toUpperCase();

  return bookingDrafts.find(
    (draft) => draft.id === normalizedId
  );
}

function updateBookingDraft(id, updates = {}) {
  const draft = getBookingDraftById(id);

  if (!draft) {
    throw createError(
      404,
      "BOOKING_DRAFT_NOT_FOUND",
      "The booking draft was not found."
    );
  }

  if (
    draft.status === "draft_created" &&
    new Date(draft.expiresAt) <= new Date()
  ) {
    draft.status = "expired";

    throw createError(
      410,
      "BOOKING_DRAFT_EXPIRED",
      "The booking draft has expired."
    );
  }

  const blockedStatuses = [
    "cancelled",
    "expired",
    "form_completed",
    "completed",
    "replaced",
  ];

  if (blockedStatuses.includes(draft.status)) {
    throw createError(
      409,
      "BOOKING_DRAFT_NOT_EDITABLE",
      `A booking draft with status ${draft.status} cannot be updated.`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      updates,
      "customerName"
    )
  ) {
    const customerName = String(
      updates.customerName || ""
    ).trim();

    if (!customerName) {
      throw createError(
        400,
        "CUSTOMER_NAME_REQUIRED",
        "customerName cannot be empty."
      );
    }

    draft.customer.name = customerName;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      updates,
      "phoneNumber"
    )
  ) {
    draft.customer.phoneNumber =
      normalizePhoneNumber(updates.phoneNumber);
  }

  if (
    Object.prototype.hasOwnProperty.call(
      updates,
      "email"
    )
  ) {
    const email = String(
      updates.email || ""
    ).trim();

    draft.customer.email = email || null;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      updates,
      "petNames"
    )
  ) {
    const petNames = normalizePetNames(
      updates.petNames
    );

    if (petNames.length !== draft.pets.count) {
      throw createError(
        400,
        "PET_NAMES_COUNT_MISMATCH",
        `Exactly ${draft.pets.count} pet name(s) are required.`
      );
    }

    draft.pets.names = petNames;
  }

  if (updates.status === "replaced") {
    draft.status = "replaced";
    draft.replacedAt = new Date().toISOString();

    draft.replacedByDraftId =
      updates.replacedByDraftId
        ? String(updates.replacedByDraftId)
            .trim()
            .toUpperCase()
        : null;
  }

  draft.updatedAt = new Date().toISOString();

  return draft;
}

function cancelBookingDraft(id, reason = "") {
  const draft = getBookingDraftById(id);

  if (!draft) {
    throw createError(
      404,
      "BOOKING_DRAFT_NOT_FOUND",
      "The booking draft was not found."
    );
  }

  if (draft.status === "cancelled") {
    return draft;
  }

  if (
    ["form_completed", "completed", "replaced"]
      .includes(draft.status)
  ) {
    throw createError(
      409,
      "BOOKING_DRAFT_NOT_CANCELLABLE",
      `A booking draft with status ${draft.status} cannot be cancelled.`
    );
  }

  if (new Date(draft.expiresAt) <= new Date()) {
    draft.status = "expired";

    throw createError(
      410,
      "BOOKING_DRAFT_EXPIRED",
      "The booking draft has expired."
    );
  }

  draft.status = "cancelled";
  draft.cancellationReason =
    String(reason || "").trim() || null;

  draft.cancelledAt = new Date().toISOString();
  draft.updatedAt = draft.cancelledAt;

  return draft;
}

module.exports = {
  createBookingDraft,
  getBookingDraftByToken,
  getBookingDraftById,
  updateBookingDraft,
  cancelBookingDraft,
  completeBookingDraft,
};