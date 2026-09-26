import { describe, expect, test } from "bun:test";
import type { Message, Part } from "@opencode-ai/sdk/v2";
import type { SessionMessageInfo } from "@opencode/client";
import {
  normalizeV1Message,
  normalizeV1Session,
  normalizeV2Messages,
  normalizeV2Session,
  totalizeTokens,
} from "./normalize";

// ── fixtures ─────────────────────────────────────────────────────────

const v1User = {
  id: "m1",
  sessionID: "s1",
  role: "user",
  time: { created: 1 },
  agent: "build",
} as unknown as Message;

const v1Assistant = {
  id: "m2",
  sessionID: "s1",
  role: "assistant",
  time: { created: 2 },
  agent: "build",
  providerID: "provider",
  modelID: "model",
  cost: 0.5,
  tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 3, write: 2 } },
} as unknown as Message;

function v1ToolPart(state: unknown): Part {
  return {
    type: "tool",
    id: "t1",
    sessionID: "s1",
    messageID: "m2",
    callID: "call-1",
    tool: "bash",
    state,
  } as unknown as Part;
}

function v2Assistant(content: unknown[], overrides: Record<string, unknown> = {}): SessionMessageInfo {
  return {
    id: "vm2",
    type: "assistant",
    time: { created: 10 },
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content,
    cost: 0.25,
    tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 40, write: 0 } },
    ...overrides,
  } as unknown as SessionMessageInfo;
}

function v2Tool(state: unknown): unknown {
  return { type: "tool", id: "vt1", name: "bash", state, time: { created: 11 } };
}

// ── tests ────────────────────────────────────────────────────────────

describe("totalizeTokens", () => {
  test("sums input+output+reasoning+cache.read+cache.write (v1 服务端口径实证一例)", () => {
    expect(
      totalizeTokens({ input: 8476, output: 2, reasoning: 0, cache: { read: 1941, write: 0 } }),
    ).toEqual({
      input: 8476,
      output: 2,
      reasoning: 0,
      cacheRead: 1941,
      cacheWrite: 0,
      total: 10419,
    });
  });

  test("tolerates missing fields", () => {
    expect(totalizeTokens(undefined).total).toBe(0);
    expect(totalizeTokens({ input: 5 }).total).toBe(5);
  });
});

describe("normalizeV1Message", () => {
  test("user message → text part, zero tokens, no model fields", () => {
    const agg = normalizeV1Message("s1", v1User, [
      { type: "text", id: "p1", sessionID: "s1", messageID: "m1", text: "hi" } as unknown as Part,
    ]);
    expect(agg.message.role).toBe("user");
    expect(agg.message.tokens.total).toBe(0);
    expect(agg.message.providerID).toBeUndefined();
    expect(agg.parts).toEqual([{ type: "text", text: "hi", time: undefined }]);
  });

  test("assistant message → model fields, cost, summed total", () => {
    const agg = normalizeV1Message("s1", v1Assistant, []);
    expect(agg.message.providerID).toBe("provider");
    expect(agg.message.modelID).toBe("model");
    expect(agg.message.cost).toBe(0.5);
    expect(agg.message.tokens.total).toBe(21);
  });

  test("tool states map to normalized states", () => {
    const pending = normalizeV1Message("s1", v1Assistant, [
      v1ToolPart({ status: "pending", input: { a: 1 } }),
    ]);
    expect(pending.parts[0]).toMatchObject({
      type: "tool",
      tool: "bash",
      callID: "call-1",
      state: { status: "pending", input: { a: 1 }, output: "", error: "" },
    });

    const running = normalizeV1Message("s1", v1Assistant, [
      v1ToolPart({ status: "running", input: { a: 1 } }),
    ]);
    expect(running.parts[0]).toMatchObject({ state: { status: "running", output: "", error: "" } });

    const completed = normalizeV1Message("s1", v1Assistant, [
      v1ToolPart({ status: "completed", input: { a: 1 }, output: "ok" }),
    ]);
    expect(completed.parts[0]).toMatchObject({
      state: { status: "completed", output: "ok", error: "" },
    });

    const error = normalizeV1Message("s1", v1Assistant, [
      v1ToolPart({ status: "error", input: {}, error: "boom" }),
    ]);
    expect(error.parts[0]).toMatchObject({
      state: { status: "error", output: "", error: "boom" },
    });
  });

  test("non-UI part types are dropped", () => {
    const agg = normalizeV1Message("s1", v1Assistant, [
      { type: "step-start" } as unknown as Part,
      { type: "file" } as unknown as Part,
      { type: "reasoning", id: "r1", sessionID: "s1", messageID: "m2", text: "think", time: { start: 3, end: 4 } } as unknown as Part,
    ]);
    expect(agg.parts).toEqual([{ type: "reasoning", text: "think", time: { start: 3, end: 4 } }]);
  });
});

describe("normalizeV1Session", () => {
  test("maps id/parentID/time.updated/cost/tokens", () => {
    const normalized = normalizeV1Session({
      id: "s1",
      parentID: "root",
      time: { updated: 99 },
      cost: 1.5,
      tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } },
    } as never);
    expect(normalized).toEqual({
      id: "s1",
      parentID: "root",
      timeUpdated: 99,
      cost: 1.5,
      tokens: { input: 1, output: 2, reasoning: 3, cacheRead: 4, cacheWrite: 5, total: 15 },
    });
  });
});

describe("normalizeV2Messages", () => {
  test("user message → text part; assistant → content parts with model ref mapping", () => {
    const messages = normalizeV2Messages("s1", [
      { id: "vu1", type: "user", time: { created: 1 }, text: "hello" } as unknown as SessionMessageInfo,
      v2Assistant([
        { type: "text", text: "answer" },
        { type: "reasoning", text: "think", time: { created: 11, completed: 12 } },
      ]),
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      sessionID: "s1",
      message: { id: "vu1", role: "user", tokens: { total: 0 } },
      parts: [{ type: "text", text: "hello" }],
    });
    expect(messages[1].message).toMatchObject({
      id: "vm2",
      role: "assistant",
      providerID: "provider",
      modelID: "model",
      cost: 0.25,
      tokens: { total: 165 },
    });
    expect(messages[1].parts).toEqual([
      { type: "text", text: "answer" },
      { type: "reasoning", text: "think", time: { start: 11, end: 12 } },
    ]);
  });

  test("tool states: streaming→pending, running, completed (content joined), error (message)", () => {
    const [streaming] = normalizeV2Messages("s1", [
      v2Assistant([v2Tool({ status: "streaming", input: '{"partial":' })]),
    ]);
    expect(streaming.parts[0]).toMatchObject({
      type: "tool",
      tool: "bash",
      callID: "vt1",
      sessionID: "s1",
      messageID: "vm2",
      state: { status: "pending", input: {}, output: "", error: "" },
    });

    const [running] = normalizeV2Messages("s1", [
      v2Assistant([v2Tool({ status: "running", input: { cmd: "ls" }, metadata: {} })]),
    ]);
    expect(running.parts[0]).toMatchObject({
      state: { status: "running", input: { cmd: "ls" }, output: "", error: "" },
    });

    const [completed] = normalizeV2Messages("s1", [
      v2Assistant([
        v2Tool({
          status: "completed",
          input: { cmd: "ls" },
          content: [
            { type: "text", text: "file-a" },
            { type: "text", text: "file-b" },
            { type: "file", uri: "file:///x", mime: "text/plain", name: "x.txt" },
          ],
          metadata: {},
        }),
      ]),
    ]);
    expect(completed.parts[0]).toMatchObject({
      state: { status: "completed", output: "file-a\nfile-b\n[file] x.txt", error: "" },
    });

    const [errored] = normalizeV2Messages("s1", [
      v2Assistant([
        v2Tool({ status: "error", input: {}, error: { type: "x", message: "boom" } }),
      ]),
    ]);
    expect(errored.parts[0]).toMatchObject({
      state: { status: "error", output: "", error: "boom" },
    });
  });

  test("filters the 9 non-conversational SessionMessageInfo variants", () => {
    const variants = [
      "agent-selected",
      "model-selected",
      "location-switched",
      "synthetic",
      "system",
      "skill",
      "shell",
      "compaction",
      "idle",
    ].map((type) => ({ id: `x-${type}`, type, time: { created: 1 } }) as unknown as SessionMessageInfo);
    expect(normalizeV2Messages("s1", variants)).toEqual([]);
  });
});

describe("normalizeV2Session", () => {
  test("maps id/parentID/time.updated/cost/tokens", () => {
    const normalized = normalizeV2Session({
      id: "s2",
      parentID: "root",
      time: { updated: 42 },
      cost: 2,
      tokens: { input: 1, output: 1, reasoning: 1, cache: { read: 1, write: 1 } },
    } as never);
    expect(normalized).toEqual({
      id: "s2",
      parentID: "root",
      timeUpdated: 42,
      cost: 2,
      tokens: { input: 1, output: 1, reasoning: 1, cacheRead: 1, cacheWrite: 1, total: 5 },
    });
  });
});
