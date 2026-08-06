const express = require("express");
const facilities = require("../data/facilities");
const { parseFlexibleDate } = require("../utils/date.utils");

const router = express.Router();

function createApiError(statusCode, code, message, details = null) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;
  error.details = details;

  return error;
}

function parseDate(value, fieldName) {
  return parseFlexibleDate(value, fieldName);
}

function calculateNights(dropOffDate, collectionDate) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  const difference =
    collectionDate.getTime() - dropOffDate.getTime();

  return Math.ceil(difference / millisecondsPerDay);
}

function datesOverlap(
  requestStart,
  requestEnd,
  existingStart,
  existingEnd
) {
  return requestStart < existingEnd && requestEnd > existingStart;
}

/**
 * Convert a dollar amount into integer cents.
 * Example: 65.50 becomes 6550.
 */
function toCents(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw createApiError(
      500,
      "INVALID_MONEY_VALUE",
      "An invalid monetary value was encountered."
    );
  }

  return Math.round((numericValue + 1e-9) * 100);
}

/**
 * Convert integer cents back into a dollar amount.
 * Example: 6550 becomes 65.50.
 */
function fromCents(cents) {
  return cents / 100;
}

/**
 * Convert a decimal rate into a fraction.
 *
 * Examples:
 * 0.3 becomes 3 / 10
 * 0.0825 becomes 825 / 10000
 *
 * This avoids floating-point rounding errors when calculating
 * tax, deposits, and remaining balances.
 */
function rateToFraction(rate) {
  const numericRate = Number(rate);

  if (!Number.isFinite(numericRate) || numericRate < 0) {
    throw createApiError(
      500,
      "INVALID_RATE",
      "An invalid pricing rate was encountered."
    );
  }

  const rateText = String(numericRate);

  if (rateText.includes("e")) {
    const precision = 1_000_000;

    return {
      numerator: Math.round(numericRate * precision),
      denominator: precision,
    };
  }

  const [wholePart, decimalPart = ""] = rateText.split(".");
  const denominator = 10 ** decimalPart.length;

  const numerator =
    Number(wholePart) * denominator +
    Number(decimalPart || 0);

  return {
    numerator,
    denominator,
  };
}

/**
 * Apply a percentage or decimal rate to an integer-cent amount.
 *
 * Example:
 * 45465 cents × 0.30 = 13640 cents
 */
function applyRateToCents(amountCents, rate) {
  const { numerator, denominator } = rateToFraction(rate);

  return Math.round(
    (amountCents * numerator) / denominator
  );
}

function getRequestContext(body) {
  const {
    facilityId,
    serviceId,
    accommodationId,
    petType,
    petCount,
    dropOffDate,
    collectionDate,
  } = body;

  if (!facilityId) {
    throw createApiError(
      400,
      "FACILITY_REQUIRED",
      "facilityId is required."
    );
  }

  if (!serviceId) {
    throw createApiError(
      400,
      "SERVICE_REQUIRED",
      "serviceId is required."
    );
  }

  if (!accommodationId) {
    throw createApiError(
      400,
      "ACCOMMODATION_REQUIRED",
      "accommodationId is required."
    );
  }

  if (!petType) {
    throw createApiError(
      400,
      "PET_TYPE_REQUIRED",
      "petType is required."
    );
  }

  const parsedPetCount = Number(petCount);

  if (
    !Number.isInteger(parsedPetCount) ||
    parsedPetCount < 1 ||
    parsedPetCount > 10
  ) {
    throw createApiError(
      400,
      "INVALID_PET_COUNT",
      "petCount must be a whole number between 1 and 10."
    );
  }

  const facility = facilities.find(
    (item) => item.id === facilityId
  );

  if (!facility) {
    throw createApiError(
      404,
      "FACILITY_NOT_FOUND",
      "The selected facility was not found."
    );
  }

  const service = facility.services.find(
    (item) => item.id === serviceId
  );

  if (!service) {
    throw createApiError(
      404,
      "SERVICE_NOT_FOUND",
      "The selected service was not found at this facility."
    );
  }

  const accommodation = facility.accommodations.find(
    (item) => item.id === accommodationId
  );

  if (!accommodation) {
    throw createApiError(
      404,
      "ACCOMMODATION_NOT_FOUND",
      "The selected accommodation was not found at this facility."
    );
  }

  if (service.petType !== petType) {
    throw createApiError(
      400,
      "SERVICE_PET_TYPE_MISMATCH",
      "The selected service does not support this pet type."
    );
  }

  if (accommodation.petType !== petType) {
    throw createApiError(
      400,
      "ACCOMMODATION_PET_TYPE_MISMATCH",
      "The selected accommodation does not support this pet type."
    );
  }

  const dropOffDateResult = parseDate(
    dropOffDate,
    "dropOffDate"
  );

  const collectionDateResult = parseDate(
    collectionDate,
    "collectionDate"
  );

  const parsedDropOffDate = dropOffDateResult.date;
  const parsedCollectionDate = collectionDateResult.date;

  const nights = calculateNights(
    parsedDropOffDate,
    parsedCollectionDate
  );

  if (nights < 1) {
    throw createApiError(
      400,
      "INVALID_DATE_RANGE",
      "The collection date must be after the drop-off date."
    );
  }

  if (nights < service.minimumNights) {
    throw createApiError(
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

    dropOffDate: dropOffDateResult.normalizedDate,
    collectionDate: collectionDateResult.normalizedDate,

    dropOffDateHuman: dropOffDateResult.humanDate,
    collectionDateHuman: collectionDateResult.humanDate,

    parsedDropOffDate,
    parsedCollectionDate,
    nights,
  };
}

function getAccommodationAvailability(
  accommodation,
  parsedDropOffDate,
  parsedCollectionDate
) {
  const reservedUnits = accommodation.reservations.reduce(
    (total, reservation) => {
      const reservationStart = new Date(
        `${reservation.from}T00:00:00.000Z`
      );

      const reservationEnd = new Date(
        `${reservation.to}T00:00:00.000Z`
      );

      const overlaps = datesOverlap(
        parsedDropOffDate,
        parsedCollectionDate,
        reservationStart,
        reservationEnd
      );

      return overlaps
        ? total + reservation.units
        : total;
    },
    0
  );

  const availableUnits = Math.max(
    accommodation.capacity - reservedUnits,
    0
  );

  return {
    reservedUnits,
    availableUnits,
    available: availableUnits > 0,
  };
}

router.get("/facilities", (req, res) => {
  const result = facilities.map((facility) => ({
    id: facility.id,
    name: facility.name,
    currency: facility.currency,
    petTypes: facility.petTypes,
  }));

  return res.status(200).json({
    success: true,
    data: result,
  });
});

router.get("/services", (req, res) => {
  const { facilityId } = req.query;

  const facility = facilities.find(
    (item) => item.id === facilityId
  );

  if (!facility) {
    return res.status(404).json({
      success: false,
      code: "FACILITY_NOT_FOUND",
      message: "The selected facility was not found.",
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      facility: {
        id: facility.id,
        name: facility.name,
      },

      services: facility.services,

      accommodations: facility.accommodations.map(
        (item) => ({
          id: item.id,
          name: item.name,
          petType: item.petType,
          capacity: item.capacity,
          baseNightlyRate: item.baseNightlyRate,
          additionalPetNightlyRate:
            item.additionalPetNightlyRate,
        })
      ),
    },
  });
});

router.post("/check-availability", (req, res) => {
  try {
    const context = getRequestContext(req.body);

    const availability = getAccommodationAvailability(
      context.accommodation,
      context.parsedDropOffDate,
      context.parsedCollectionDate
    );

    const alternatives = context.facility.accommodations
      .filter(
        (item) =>
          item.id !== context.accommodation.id &&
          item.petType === context.petType
      )
      .map((item) => {
        const alternativeAvailability =
          getAccommodationAvailability(
            item,
            context.parsedDropOffDate,
            context.parsedCollectionDate
          );

        return {
          id: item.id,
          name: item.name,
          available: alternativeAvailability.available,
          availableUnits:
            alternativeAvailability.availableUnits,
          baseNightlyRate: item.baseNightlyRate,
        };
      })
      .filter((item) => item.available);

    return res.status(200).json({
      success: true,
      data: {
        available: availability.available,
        availableUnits: availability.availableUnits,
        nights: context.nights,

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

        petType: context.petType,
        petCount: context.petCount,

        dropOffDate: context.dropOffDate,
        collectionDate: context.collectionDate,

        dropOffDateHuman: context.dropOffDateHuman,
        collectionDateHuman:
          context.collectionDateHuman,

        alternatives,
      },
    });
  } catch (error) {
    const response = {
      success: false,
      code:
        error.code ||
        "AVAILABILITY_CHECK_FAILED",
      message:
        error.message ||
        "The availability check could not be completed.",
    };

    if (error.details) {
      response.details = error.details;
    }

    return res
      .status(error.statusCode || 500)
      .json(response);
  }
});

router.post("/calculate-quote", (req, res) => {
  try {
    const context = getRequestContext(req.body);

    const availability = getAccommodationAvailability(
      context.accommodation,
      context.parsedDropOffDate,
      context.parsedCollectionDate
    );

    if (!availability.available) {
      return res.status(409).json({
        success: false,
        code: "NO_AVAILABILITY",
        message:
          "The selected accommodation is unavailable for those dates.",
      });
    }

    const additionalPets = Math.max(
      context.petCount - 1,
      0
    );

    /*
     * All financial calculations are performed using
     * integer cents to prevent floating-point errors.
     */
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

    return res.status(200).json({
      success: true,
      data: {
        available: true,
        currency: context.facility.currency,

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

        petType: context.petType,
        petCount: context.petCount,

        dropOffDate: context.dropOffDate,
        collectionDate: context.collectionDate,

        dropOffDateHuman: context.dropOffDateHuman,
        collectionDateHuman:
          context.collectionDateHuman,

        nights: context.nights,

        priceBreakdown: {
          baseNightlyRate: fromCents(
            baseNightlyRateCents
          ),

          serviceNightlyAdjustment: fromCents(
            serviceNightlyAdjustmentCents
          ),

          additionalPetNightlyTotal: fromCents(
            additionalPetNightlyTotalCents
          ),

          nightlyTotal: fromCents(
            nightlyTotalCents
          ),

          subtotal: fromCents(
            subtotalCents
          ),

          tax: fromCents(
            taxCents
          ),

          total: fromCents(
            totalCents
          ),

          deposit: fromCents(
            depositCents
          ),

          remainingBalance: fromCents(
            remainingBalanceCents
          ),
        },
      },
    });
  } catch (error) {
    const response = {
      success: false,
      code:
        error.code ||
        "QUOTE_CALCULATION_FAILED",
      message:
        error.message ||
        "The quote could not be calculated.",
    };

    if (error.details) {
      response.details = error.details;
    }

    return res
      .status(error.statusCode || 500)
      .json(response);
  }
});

module.exports = router;