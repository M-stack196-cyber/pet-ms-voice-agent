const express = require("express");

const router = express.Router();

function normalizeArguments(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return {};
}

async function callLocalVoiceApi(endpoint, body) {
  const port = Number(process.env.PORT) || 3000;

  const response = await fetch(
    `http://127.0.0.1:${port}/api/voice${endpoint}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    data = {
      success: false,
      code: "INVALID_BACKEND_RESPONSE",
      message: "The Pet-MS backend returned an invalid response.",
    };
  }

  return data;
}

async function executeTool(toolName, argumentsValue) {
  const argumentsObject = normalizeArguments(argumentsValue);

  switch (toolName) {
    case "check_availability":
      return callLocalVoiceApi(
        "/check-availability",
        argumentsObject
      );

    case "calculate_quote":
      return callLocalVoiceApi(
        "/calculate-quote",
        argumentsObject
      );

    case "create_booking_draft":
      return callLocalVoiceApi(
        "/create-booking-draft",
        argumentsObject
      );

    default:
      return {
        success: false,
        code: "UNKNOWN_TOOL",
        message: `The tool "${toolName}" is not supported.`,
      };
  }
}

router.post("/vapi-tools", async (req, res) => {
  const toolCalls = req.body?.message?.toolCallList;

  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return res.status(400).json({
      success: false,
      code: "NO_TOOL_CALLS",
      message: "No Vapi tool calls were provided.",
    });
  }

  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      try {
        const output = await executeTool(
          toolCall.name,
          toolCall.arguments
        );

        return {
          toolCallId: toolCall.id,
          result: JSON.stringify(output),
        };
      } catch (error) {
        return {
          toolCallId: toolCall.id,
          result: JSON.stringify({
            success: false,
            code: "TOOL_EXECUTION_FAILED",
            message:
              error.message ||
              "The Pet-MS tool could not be completed.",
          }),
        };
      }
    })
  );

  return res.status(200).json({
    results,
  });
});

module.exports = router;