const assert = require("node:assert/strict");
require("dotenv").config();

const pool = require("../src/db");

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const createdDraftIds = [];

async function cleanupTestDrafts() {
  if (createdDraftIds.length === 0) {
    return;
  }

  const result = await pool.query(
    `
      DELETE FROM booking_drafts
      WHERE id = ANY($1::text[])
    `,
    [createdDraftIds]
  );

  console.log(
    `✓ cleaned ${result.rowCount} smoke-test database record(s)`
  );
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const body = await response.json();

  return { response, body };
}

async function run() {
  const checks = [];

  const health = await jsonRequest("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.success, true);
  checks.push("health endpoint");

  const dogPayload = {
    facilityId: "dancing-creek-farm",
    serviceId: "short-term-boarding",
    accommodationId: "large-cabin",
    petType: "dog",
    petCount: 2,
    dropOffDate: "2026-11-15",
    collectionDate: "2026-11-20",
  };

  const availability = await jsonRequest(
    "/api/voice/check-availability",
    {
      method: "POST",
      body: JSON.stringify(dogPayload),
    }
  );

  assert.equal(availability.response.status, 200);
  assert.equal(availability.body.success, true);
  assert.equal(availability.body.data.available, true);
  checks.push("availability check");

  const quote = await jsonRequest("/api/voice/calculate-quote", {
    method: "POST",
    body: JSON.stringify(dogPayload),
  });

  assert.equal(quote.response.status, 200);
  assert.equal(quote.body.success, true);
  assert.equal(typeof quote.body.data.priceBreakdown.total, "number");
  assert.equal(typeof quote.body.data.priceBreakdown.deposit, "number");
  checks.push("quote calculation");

  const firstDraft = await jsonRequest(
    "/api/voice/create-booking-draft",
    {
      method: "POST",
      body: JSON.stringify({
        ...dogPayload,
        customerName: "Automated Test Customer",
        phoneNumber: "03001234567",
        petNames: ["Buddy", "Max"],
      }),
    }
  );

  assert.equal(firstDraft.response.status, 201);
  assert.equal(firstDraft.body.success, true);

  const firstDraftId = firstDraft.body.data.id;
  assert.ok(firstDraftId);
  createdDraftIds.push(firstDraftId);
  checks.push("booking draft creation");

  const updated = await jsonRequest(
    `/api/voice/booking-drafts/${firstDraftId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        customerName: "Updated Test Customer",
        petNames: ["Buddy", "Max"],
      }),
    }
  );

  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.success, true);
  checks.push("booking draft update");

  const cancelled = await jsonRequest(
    `/api/voice/booking-drafts/${firstDraftId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: "Automated regression test",
      }),
    }
  );

  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.success, true);
  assert.equal(cancelled.body.data.status, "cancelled");
  checks.push("booking draft cancellation");

  const secondDraft = await jsonRequest(
    "/api/voice/create-booking-draft",
    {
      method: "POST",
      body: JSON.stringify({
        customerName: "Secure Form Test",
        phoneNumber: "03001234567",
        petNames: ["Milo"],
        facilityId: "whisker-haven-cattery",
        serviceId: "cat-boarding",
        accommodationId: "cat-condo",
        petType: "cat",
        petCount: 1,
        dropOffDate: "2026-11-15",
        collectionDate: "2026-11-18",
      }),
    }
  );

  assert.equal(secondDraft.response.status, 201);
  assert.equal(secondDraft.body.success, true);

  const secondDraftId = secondDraft.body.data.id;
  assert.ok(secondDraftId);
  createdDraftIds.push(secondDraftId);

  const token = secondDraft.body.data.token;
  assert.ok(token);

  const formBody = new URLSearchParams({
    breed: "British Shorthair",
    age: "3 years",
    feedingInstructions: "Feed twice daily",
    specialNotes: "None",
  });

  const firstSubmission = await fetch(
    `${baseUrl}/complete-booking/${token}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    }
  );

  const firstHtml = await firstSubmission.text();

  assert.equal(firstSubmission.status, 200);
  assert.match(firstHtml.toLowerCase(), /submitted successfully/);
  checks.push("secure form first submission");

  const secondSubmission = await fetch(
    `${baseUrl}/complete-booking/${token}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    }
  );

  const secondHtml = await secondSubmission.text();

  assert.equal(secondSubmission.status, 409);
  assert.match(secondHtml.toLowerCase(), /already been submitted/);
  checks.push("duplicate form submission blocking");

  console.log("\nPet-MS smoke tests passed:");
  checks.forEach((check) => console.log(`✓ ${check}`));
}

run()
  .catch((error) => {
    console.error("\nPet-MS smoke tests failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupTestDrafts();
    } catch (error) {
      console.error(
        "Smoke-test cleanup failed:",
        error.message
      );
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  });
