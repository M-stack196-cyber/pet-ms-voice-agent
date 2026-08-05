const express = require("express");
const facilities = require("../data/facilities");

const router = express.Router();

function createApiError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parseDate(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw createApiError(
      400,
      "MISSING_DATE",
      `${fieldName} is required.`
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw createApiError(
      400,
      "INVALID_DATE",
      `${fieldName} must use YYYY-MM-DD format.`
    );
  }

  return date;
}

function calculateNights(dropOffDate, collectionDate) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const difference = collectionDate.getTime() - dropOffDate.getTime();

  return Math.ceil(difference / millisecondsPerDay);
}

function datesOverlap(requestStart, requestEnd, existingStart, existingEnd) {
  return requestStart < existingEnd && requestEnd > existingStart;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
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

  const facility = facilities.find((item) => item.id === facilityId);

  if (!facility) {
    throw createApiError(
      404,
      "FACILITY_NOT_FOUND",
      "The selected facility was not found."
    );
  }

  const service = facility.services.find((item) => item.id === serviceId);

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

  const parsedDropOffDate = parseDate(dropOffDate, "dropOffDate");
  const parsedCollectionDate = parseDate(
    collectionDate,
    "collectionDate"
  );

  const nights = calculateNights(
    parsedDropOffDate,
    parsedCollectionDate
  );

  if (nights < 1) {
    throw createApiError(
      400,
      "INVALID_DATE_RANGE",
      "collectionDate must be after dropOffDate."
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
    dropOffDate,
    collectionDate,
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

      return overlaps ? total + reservation.units : total;
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

  res.status(200).json({
    success: true,
    data: result,
  });
});

router.get("/services", (req, res) => {
  const { facilityId } = req.query;

  const facility = facilities.find((item) => item.id === facilityId);

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
      accommodations: facility.accommodations.map((item) => ({
        id: item.id,
        name: item.name,
        petType: item.petType,
        capacity: item.capacity,
        baseNightlyRate: item.baseNightlyRate,
        additionalPetNightlyRate: item.additionalPetNightlyRate,
      })),
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
          availableUnits: alternativeAvailability.availableUnits,
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
        dropOffDate: context.dropOffDate,
        collectionDate: context.collectionDate,
        alternatives,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "AVAILABILITY_CHECK_FAILED",
      message:
        error.message || "The availability check could not be completed.",
    });
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
    const remainingBalance = total - deposit;

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
        nights: context.nights,
        priceBreakdown: {
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
          remainingBalance: roundMoney(remainingBalance),
        },
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "QUOTE_CALCULATION_FAILED",
      message:
        error.message || "The quote could not be calculated.",
    });
  }
});

module.exports = router;