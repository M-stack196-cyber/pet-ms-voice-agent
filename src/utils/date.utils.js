const chrono = require("chrono-node");

function createDateError(code, message, details = null) {
  const error = new Error(message);

  error.statusCode = 400;
  error.code = code;
  error.details = details;

  return error;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function toIsoDate(year, month, day) {
  return `${year}-${padNumber(month)}-${padNumber(day)}`;
}

function createUtcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    throw createDateError(
      "INVALID_DATE",
      "The provided date is not a valid calendar date."
    );
  }

  return date;
}

function normalizeYear(value) {
  const yearText = String(value).trim();

  if (!/^\d+$/.test(yearText)) {
    throw createDateError(
      "INVALID_YEAR",
      "Please provide a valid four-digit year."
    );
  }

  if (yearText.length === 2) {
    return 2000 + Number(yearText);
  }

  if (yearText.length !== 4) {
    throw createDateError(
      "INVALID_YEAR",
      `The year "${yearText}" is invalid. Please provide a four-digit year, such as 2026.`
    );
  }

  const year = Number(yearText);

  if (year < 2000 || year > 2100) {
    throw createDateError(
      "INVALID_YEAR",
      "The booking year must be between 2000 and 2100."
    );
  }

  return year;
}

function formatHumanDate(year, month, day) {
  const date = createUtcDate(year, month, day);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function buildDateResult(year, month, day, originalValue, source) {
  const date = createUtcDate(year, month, day);

  return {
    date,
    normalizedDate: toIsoDate(year, month, day),
    humanDate: formatHumanDate(year, month, day),
    originalValue,
    source,
  };
}

function normalizeInput(value) {
  return String(value)
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\b20\s+(\d{2})\b/g, "20$1")
    .replace(/\b19\s+(\d{2})\b/g, "19$1")
    .replace(/\s+/g, " ");
}

function parseYearFirstDate(value, originalValue) {
  const match = value.match(
    /^(\d{4})[\s/.\-]+(\d{1,2})[\s/.\-]+(\d{1,2})$/
  );

  if (!match) {
    return null;
  }

  const year = normalizeYear(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return buildDateResult(
    year,
    month,
    day,
    originalValue,
    "year-first"
  );
}

function parseNumericDate(value, originalValue) {
  const match = value.match(
    /^(\d{1,2})[\s/.\-]+(\d{1,2})[\s/.\-]+(\d{2,5})$/
  );

  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = normalizeYear(match[3]);

  if (first < 1 || second < 1 || first > 31 || second > 31) {
    throw createDateError(
      "INVALID_DATE",
      `"${originalValue}" is not a valid date.`
    );
  }

  // Example: 15/08/2026 can only mean 15 August 2026.
  if (first > 12 && second <= 12) {
    return buildDateResult(
      year,
      second,
      first,
      originalValue,
      "day-first"
    );
  }

  // Example: 08/15/2026 can only mean August 15, 2026.
  if (second > 12 && first <= 12) {
    return buildDateResult(
      year,
      first,
      second,
      originalValue,
      "month-first"
    );
  }

  if (first > 12 && second > 12) {
    throw createDateError(
      "INVALID_DATE",
      `"${originalValue}" is not a valid date.`
    );
  }

  // Example: 05/08/2026 could mean May 8 or August 5.
  if (first !== second) {
    const dayFirst = buildDateResult(
      year,
      second,
      first,
      originalValue,
      "day-first-option"
    );

    const monthFirst = buildDateResult(
      year,
      first,
      second,
      originalValue,
      "month-first-option"
    );

    throw createDateError(
      "AMBIGUOUS_DATE",
      `The date "${originalValue}" is ambiguous. Do you mean ${dayFirst.humanDate} or ${monthFirst.humanDate}?`,
      {
        options: [
          {
            label: dayFirst.humanDate,
            normalizedDate: dayFirst.normalizedDate,
          },
          {
            label: monthFirst.humanDate,
            normalizedDate: monthFirst.normalizedDate,
          },
        ],
      }
    );
  }

  return buildDateResult(
    year,
    first,
    second,
    originalValue,
    "numeric"
  );
}

function parseNaturalDate(value, originalValue) {
  const referenceDate = new Date();

  const results = chrono.parse(value, referenceDate, {
    forwardDate: true,
  });

  if (!results.length) {
    throw createDateError(
      "INVALID_DATE",
      `I could not understand the date "${originalValue}". Please say it again using the month name, such as August 15, 2026.`
    );
  }

  const parsedStart = results[0].start;

  const year = normalizeYear(parsedStart.get("year"));
  const month = parsedStart.get("month");
  const day = parsedStart.get("day");

  return buildDateResult(
    year,
    month,
    day,
    originalValue,
    "natural-language"
  );
}

function parseFlexibleDate(value, fieldName = "date") {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    throw createDateError(
      "MISSING_DATE",
      `${fieldName} is required.`
    );
  }

  const originalValue = String(value).trim();
  const normalizedInput = normalizeInput(originalValue);

  const yearFirstResult = parseYearFirstDate(
    normalizedInput,
    originalValue
  );

  if (yearFirstResult) {
    return yearFirstResult;
  }

  const numericResult = parseNumericDate(
    normalizedInput,
    originalValue
  );

  if (numericResult) {
    return numericResult;
  }

  return parseNaturalDate(normalizedInput, originalValue);
}

module.exports = {
  parseFlexibleDate,
};
