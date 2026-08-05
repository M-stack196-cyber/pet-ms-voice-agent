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
  const additionalPets = Math.max(context.petCount - 1, 0);

  const additionalPetNightlyTotal =
    additionalPets *
    context.accommodation.additionalPetNightlyRate;

  const nightlyTotal =
    context.accommodation.baseNightlyRate +
    context.service.nightlyAdjustment +
    additionalPetNightlyTotal;

  const subtotal = nightlyTotal * context.nights;
  const tax = subtotal * context.facility.taxRate;
  const total = subtotal + tax;
  const deposit = total * context.facility.depositRate;

  return {
    currency: context.facility.currency,
    baseNightlyRate: roundMoney(
      context.accommodation.baseNightlyRate
    ),
    serviceNightlyAdjustment: roundMoney(
      context.service.nightlyAdjustment
    ),
    additionalPetNightlyTotal: roundMoney(
      additionalPetNightlyTotal
    ),
    nightlyTotal: roundMoney(nightlyTotal),
    subtotal: roundMoney(subtotal),
    tax: roundMoney(tax),
    total: roundMoney(total),
    deposit: roundMoney(deposit),
    remainingBalance: roundMoney(total - deposit),
  };
}

function createBookingDraft(payload) {
  const customerName = String(payload.customerName || "").trim();
  const phoneNumber = String(payload.phoneNumber || "").trim();
  const email = String(payload.email || "").trim();

  if (!customerName) {
    throw createError(
      400,
      "CUSTOMER_NAME_REQUIRED",
      "customerName is required."
    );
  }

  if (!phoneNumber) {
    throw createError(
      400,
      "PHONE_NUMBER_REQUIRED",
      "phoneNumber is required."
    );
  }

  if (!/^\+?[0-9\s()-]{7,20}$/.test(phoneNumber)) {
    throw createError(
      400,
      "INVALID_PHONE_NUMBER",
      "Provide a valid phone number."
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

  draft.petDetails = {
    breed: String(details.breed || "").trim(),
    age: String(details.age || "").trim(),
    feedingInstructions: String(
      details.feedingInstructions || ""
    ).trim(),
    specialNotes: String(details.specialNotes || "").trim(),
  };

  draft.status = "form_completed";
  draft.completedAt = new Date().toISOString();

  return draft;
}

module.exports = {
  createBookingDraft,
  getBookingDraftByToken,
  completeBookingDraft,
};