/**
 * thinking-only-guard.ts
 *
 * Detects when Qwen3.6 puts a tool call inside the thinking section
 * instead of executing it as a real tool call, leaving the message
 * with only thinking content and no text or tool calls.
 *
 * Extracts the trapped tool call and sends it back to the model
 * so it can execute it properly instead of just asking to continue.
 *
 * Trigger condition:
 *   - Exactly ONE tool call marker inside thinking content
 *   - No text block in the content array
 *   - No real toolCall entries in the content array
 *   - Only fires during live streaming (not on session replay)
 *
 * Events used:
 *   - message_update: accumulates thinking content during streaming
 *   - turn_end: resets retry counter per turn
 *   - message_end: detects the pattern and sends the trapped tool call
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Tool call markers used by pi's tool format
const TOOL_OPEN = "<tool_call>";
const TOOL_CLOSE = "</tool_call>";

/** Extract the tool call block from thinking text.
 * Returns the raw tool call string including markers, or null.
 */
function extractToolCall(text: string): string | null {
  const openIdx = text.indexOf(TOOL_OPEN);
  if (openIdx === -1) return null;
  const closeIdx = text.indexOf(TOOL_CLOSE, openIdx);
  if (closeIdx === -1) return null;
  return text.slice(openIdx, closeIdx + TOOL_CLOSE.length);
}

/** Count how many tool_call blocks appear in the thinking text */
function countToolCalls(text: string): number {
  return (text.split(TOOL_OPEN).length - 1);
}

/** Extract all tool call blocks from thinking text */
function extractAllToolCalls(text: string): string[] {
  const calls: string[] = [];
  let idx = 0;
  while (true) {
    const openIdx = text.indexOf(TOOL_OPEN, idx);
    if (openIdx === -1) break;
    const closeIdx = text.indexOf(TOOL_CLOSE, openIdx);
    if (closeIdx === -1) break;
    calls.push(text.slice(openIdx, closeIdx + TOOL_CLOSE.length));
    idx = closeIdx + TOOL_CLOSE.length;
  }
  return calls;
}

export default function (pi: ExtensionAPI) {
  const maxRetries = 2;

  let lastThinking = "";
  let sawThinkingDelta = false;
  let retryCount = 0;

  pi.on("message_start", async (event) => {
    if (event.message.role === "assistant") {
      lastThinking = "";
      sawThinkingDelta = false;
    }
  });

  pi.on("message_update", async (event) => {
    const amEvent = event.assistantMessageEvent;
    if (amEvent.type === "thinking_delta") {
      sawThinkingDelta = true;
      lastThinking += amEvent.delta;
    }
  });

  pi.on("turn_end", async () => {
    retryCount = 0;
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") {
      lastThinking = "";
      sawThinkingDelta = false;
      return;
    }

    const content = event.message.content;
    const thinking = lastThinking;

    // Only act on live streaming (not session replay / restore)
    if (!sawThinkingDelta || thinking.length === 0) {
      lastThinking = "";
      sawThinkingDelta = false;
      return;
    }

    const toolCallCount = countToolCalls(thinking);

    // Check content array for text blocks and real toolCall entries
    const hasText = typeof content === "string"
      ? content.trim().length > 0
      : Array.isArray(content)
        ? content.some((c: any) => c.type === "text" && c.text?.trim().length > 0)
        : false;

    const hasRealToolCalls = Array.isArray(content)
      ? content.some((c: any) => c.type === "toolCall")
      : false;

    // Trigger: exactly one tool call trapped in thinking, no text, no real tool calls
    if (toolCallCount >= 1 && !hasText && !hasRealToolCalls) {
      if (retryCount >= maxRetries) {
        ctx.ui.notify(`Thinking guard: stopped after ${maxRetries} retries`, "warn");
      } else {
        retryCount++;
        const trappedCall = extractToolCall(thinking);
        let followUp;
        if (trappedCall) {
          // Send the exact tool call back so the model can execute it
          followUp = `Your last response had this tool call inside your thinking block instead of executing it. Please execute it now:\n\n${trappedCall}`;
        } else {
          followUp = "You placed a tool call inside your thinking block instead of executing it. Please continue and make the tool call properly.";
        }
        ctx.ui.notify(
          `Thinking guard: repeating trapped tool call(s) (attempt ${retryCount}/${maxRetries})`,
          "warn"
        );
        setTimeout(() => {
          pi.sendUserMessage(followUp, { triggerTurn: true });
        }, 500);
      }
    }

    lastThinking = "";
    sawThinkingDelta = false;
  });
}
