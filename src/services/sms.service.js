function sendMockSms({ to, bookingDraft }) {
  const message = [
    `Pet-MS booking request ${bookingDraft.id} has been prepared.`,
    `Complete your secure booking form here: ${bookingDraft.completionUrl}`,
    `This sandbox link expires at ${bookingDraft.expiresAt}.`,
  ].join(" ");

  console.log("\n================ MOCK SMS ================");
  console.log("Mode: Sandbox");
  console.log(`To: ${to}`);
  console.log(`Message: ${message}`);
  console.log("==========================================\n");

  return {
    success: true,
    mode: "mock",
    to,
    message,
  };
}

module.exports = {
  sendMockSms,
};
