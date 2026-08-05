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

/**
 * Vapi may send the function name in more than one structure:
 *
 * toolCall.name
 * toolCall.function.name
 * toolCall.toolCall.function.name
 */
function getToolName(toolCall) {
  return (
    toolCall?.name ||
    toolCall?.function?.name ||
    toolCall?.toolCall?.name ||
    toolCall?.toolCall?.function?.name ||
    null
  );
}

/**
 * Vapi may send arguments as arguments, parameters,
 * or inside a nested function object.
 */
function getToolArguments(toolCall) {
  const value =
    toolCall?.arguments ??
    toolCall?.parameters ??
    toolCall?.function?.arguments ??
    toolCall?.function?.parameters ??
    toolCall?.toolCall?.arguments ??
    toolCall?.toolCall?.parameters ??
    toolCall?.toolCall?.function?.arguments ??
    toolCall?.toolCall?.function?.parameters ??
    {};

  return normalizeArguments(value);
}

function getToolCalls(message) {
  if (Array.isArray(message?.toolCallList)) {
    return message.toolCallList;
  }

  if (Array.isArray(message?.toolWithToolCallList)) {
    return message.toolWithToolCallList.map((item) => {
      if (item?.toolCall) {
        return {
          ...item.toolCall,
          name:
            item.toolCall.name ||
            item.toolCall.function?.name ||
            item.name,
        };
      }

      return item;
    });
  }

  return [];
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
  switch (toolName) {
    case "check_availability":
      return callLocalVoiceApi(
        "/check-availability",
        argumentsValue
      );

    case "calculate_quote":
      return callLocalVoiceApi(
        "/calculate-quote",
        argumentsValue
      );

    case "create_booking_draft":
      return callLocalVoiceApi(
        "/create-booking-draft",
        argumentsValue
      );

    default:
      return {
        success: false,
        code: "UNKNOWN_TOOL",
        message: toolName
          ? `The tool "${toolName}" is not supported.`
          : "The Vapi request did not include a recognizable tool name.",
      };
  }
}

router.post("/vapi-tools", async (req, res) => {
  const message = req.body?.message;
  const toolCalls = getToolCalls(message);

  if (toolCalls.length === 0) {
    return res.status(400).json({
      success: false,
      code: "NO_TOOL_CALLS",
      message: "No Vapi tool calls were provided.",
    });
  }

  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const toolCallId =
        toolCall?.id ||
        toolCall?.toolCall?.id ||
        "unknown-tool-call";

      try {
        const toolName = getToolName(toolCall);
        const toolArguments = getToolArguments(toolCall);

        console.log("Vapi tool received:", {
          toolCallId,
          toolName,
          toolArguments,
        });

        const output = await executeTool(
          toolName,
          toolArguments
        );

        return {
          toolCallId,
          result: JSON.stringify(output),
        };
      } catch (error) {
        console.error("Vapi tool execution failed:", error);

        return {
          toolCallId,
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