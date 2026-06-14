# Qwen3.6 Thinking-Only Guard — Pi Extension

## Problem

Qwen3.6-27B (and similar thinking-capable models via providers like airouter) sometimes places
tool calls inside the `reasoning_content` (thinking block) instead of as proper `tool_calls` in the API response.

- `finish_reason: "stop"` — model thinks it is done
- Thinking content contains `<tool_call>` ... `</tool_call>` blocks
- No actual `tool_calls` in response — pi does not execute them
- No text content — user sees empty or thinking-only response

Known issue: [sgl-project/sglang#27021](https://github.com/sgl-project/sglang/issues/27021)

## Root Cause

Provider emits:
```
    reasoning_content: "<tool_call>
<function=read>
<parameter=path>
/home/reluxa/.profile
</parameter>
</function>
</tool_call>"
    content: ""
    finish_reason: "stop"
```

Pi's OpenAI-completions parser puts thinking in `[type: "thinking"]`, finds no tool calls,
and the turn ends. The model "stopped" from its perspective.

## Solution: thinking-only-guard.ts

A pi extension that detects this pattern during live streaming and sends the trapped
tool call(s) back to the model so it can execute them properly.

### Files

| File | Purpose |
|------|---------|
| `~/.pi/agent/extensions/thinking-only-guard.ts` | The extension |
| `~/.pi/agent/extensions/tests/thinking-only-guard.test.js` | Unit tests (14 tests) |

### How It Works

1. `message_update` — Accumulates `thinking_delta` tokens into `lastThinking`
2. `message_end` — Checks if the completed assistant message matches the pattern:
   - `toolCallCount >= 1` (one or more <tool_call> blocks in thinking)
   - `hasText === false` (no `type: "text"` in content array)
   - `hasRealToolCalls === false` (no `type: "toolCall"` in content array)
   - `sawThinkingDelta === true` (only fires during live streaming, not session replay)
3. If matched — extracts the exact tool call block(s) from thinking and sends a follow-up:
   > Your last response had N tool call(s) inside your thinking block. Please execute them now:
   >
   > <tool_call>
   <function=read>
   <path>
   /home/reluxa/.profile
   </parameter>
   </function>
   </tool_call>
4. `turn_end` — Resets retry counter
5. Max 2 retries per turn before giving up

### Trigger Conditions

| Condition | Must be |
|-----------|---------|
| Tool calls in thinking | >= 1 |
| Text blocks in content | 0 |
| Real toolCall entries | 0 |
| Live streaming | Yes |
| Retry count | < maxRetries (2) |

### Configuration

Editable at the top of the extension file.

| Setting | Default | Notes |
|---------|---------|-------|
| `maxRetries` | 2 | Max auto-continue per turn |

### Running Tests

```bash
node ~/.pi/agent/extensions/tests/thinking-only-guard.test.js
```

14 tests: single call, multiple calls, with text, with real toolCalls, plain thinking, empty thinking, extract N calls

### Session Replay Results

Scanned 763 thinking-only messages across `~/.pi/agent/sessions/--home-reluxa--/`.
4 would have triggered the guard (entries 50556cf1, 968d54e2, bf309c6e, 051b0538).

## Design Decisions

### Why send back as user message?

The turn is already finalized by `message_end` — pi will not re-scan for tool calls.
Sending the trapped call back triggers a fresh turn where the model executes it.

### Why not modify the message in-place?

`message_end` can return `{ message }` to replace it, but the turn is already done.
Converting thinking to text only makes the calls visible, not executable.

### Why not a custom provider wrapper?

Technically possible — intercept raw streaming chunks, restructure reasoning_content into tool_calls.
However: significantly more engineering, fragile (depends on provider internals).
Current approach works and costs one extra turn.

## Related

- [Qwen3.6-27B on HuggingFace](https://huggingface.co/Qwen/Qwen3.6-27B)
- [SGLang issue: stops after thinking](https://github.com/sgl-project/sglang/issues/27021)
- [LMStudio: thinking + tool call issue](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/2045)