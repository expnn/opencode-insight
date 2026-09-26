import type { Message, Part, Session, ToolState } from "@opencode-ai/sdk/v2";
import type {
  SessionInfo,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  ToolContent,
} from "@opencode/client";

/** 会话树遍历深度上限（v1/v2 数据源共用）。 */
export const MAX_TREE_DEPTH = 4;

// ── 归一化模型（v1 SDK 与 v2 SessionMessageInfo 都映射到它） ──────────

export interface NormalizedTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface NormalizedSession {
  id: string;
  parentID?: string;
  /** 会话级新鲜度信号：v1 `Session.time.updated` / v2 `SessionInfo.time.updated`。 */
  timeUpdated: number;
  cost: number;
  tokens: NormalizedTokens;
}

export interface NormalizedMessage {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  agent?: string;
  providerID?: string;
  modelID?: string;
  cost: number;
  tokens: NormalizedTokens;
  time: { created: number };
}

export interface NormalizedTextPart {
  type: "text";
  text: string;
  time?: { start: number; end?: number };
}

export interface NormalizedReasoningPart {
  type: "reasoning";
  text: string;
  time?: { start: number; end?: number };
}

export type NormalizedToolStatus = "pending" | "running" | "completed" | "error";

export interface NormalizedToolPart {
  type: "tool";
  id: string;
  sessionID: string;
  messageID: string;
  tool: string;
  callID: string;
  state: {
    status: NormalizedToolStatus;
    input: Record<string, unknown>;
    output: string;
    error: string;
  };
}

export type NormalizedPart = NormalizedTextPart | NormalizedReasoningPart | NormalizedToolPart;

export interface AggregatedMessage {
  sessionID: string;
  message: NormalizedMessage;
  parts: NormalizedPart[];
}

export const ZERO_TOKENS: NormalizedTokens = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
};

/**
 * 统一 token 口径：`total = input + output + reasoning + cache.read + cache.write`。
 * v2 `TokenUsageInfo` 无 total；v1 服务端 total 与该公式的一致性在 P6 对拍中核验
 * （已实证一例：10419 = 8476 + 2 + 0 + 1941 + 0）。
 */
export function totalizeTokens(
  tokens:
    | {
        input?: number;
        output?: number;
        reasoning?: number;
        cache?: { read?: number; write?: number };
      }
    | undefined,
): NormalizedTokens {
  const input = tokens?.input ?? 0;
  const output = tokens?.output ?? 0;
  const reasoning = tokens?.reasoning ?? 0;
  const cacheRead = tokens?.cache?.read ?? 0;
  const cacheWrite = tokens?.cache?.write ?? 0;
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: input + output + reasoning + cacheRead + cacheWrite,
  };
}

// ── v1（@opencode-ai/sdk/v2）映射 ────────────────────────────────────

export function normalizeV1Session(session: Session): NormalizedSession {
  return {
    id: session.id,
    parentID: session.parentID,
    timeUpdated: session.time.updated,
    cost: session.cost ?? 0,
    tokens: totalizeTokens(session.tokens),
  };
}

export function normalizeV1Message(
  sessionID: string,
  info: Message,
  parts: Part[],
): AggregatedMessage {
  const assistant = info.role === "assistant";
  return {
    sessionID,
    message: {
      id: info.id,
      sessionID,
      role: info.role,
      agent: info.agent,
      providerID: assistant ? info.providerID : undefined,
      modelID: assistant ? info.modelID : undefined,
      cost: assistant ? info.cost : 0,
      tokens: assistant ? totalizeTokens(info.tokens) : { ...ZERO_TOKENS },
      time: { created: info.time.created },
    },
    // 只保留 UI 消费的 text / reasoning / tool；其余 part 类型（step-start、
    // step-finish、file、snapshot、patch 等）在本插件中不渲染，直接丢弃。
    parts: parts.flatMap(normalizeV1Part),
  };
}

function normalizeV1Part(part: Part): NormalizedPart[] {
  switch (part.type) {
    case "text":
      return [{ type: "text", text: part.text, time: part.time }];
    case "reasoning":
      return [{ type: "reasoning", text: part.text, time: part.time }];
    case "tool":
      return [
        {
          type: "tool",
          id: part.id,
          sessionID: part.sessionID,
          messageID: part.messageID,
          tool: part.tool,
          callID: part.callID,
          state: normalizeV1ToolState(part.state),
        },
      ];
    default:
      return [];
  }
}

function normalizeV1ToolState(state: ToolState): NormalizedToolPart["state"] {
  switch (state.status) {
    case "pending":
      return { status: "pending", input: state.input, output: "", error: "" };
    case "running":
      return { status: "running", input: state.input, output: "", error: "" };
    case "completed":
      return { status: "completed", input: state.input, output: state.output, error: "" };
    case "error":
      return { status: "error", input: state.input, output: "", error: state.error };
  }
}

// ── v2（@opencode/client）映射 ──────────────────────────────────────

export function normalizeV2Session(session: SessionInfo): NormalizedSession {
  return {
    id: session.id,
    parentID: session.parentID,
    timeUpdated: session.time.updated,
    cost: session.cost ?? 0,
    tokens: totalizeTokens(session.tokens),
  };
}

/**
 * `SessionMessageInfo` 共 11 种变体；只保留 user / assistant 两种对话消息，
 * 其余 9 种（agent-selected、model-selected、location-switched、synthetic、
 * system、skill、shell、compaction、idle）在本插件中不渲染。
 */
export function normalizeV2Messages(
  sessionID: string,
  messages: SessionMessageInfo[],
): AggregatedMessage[] {
  const out: AggregatedMessage[] = [];
  for (const msg of messages) {
    if (msg.type === "user") {
      out.push({
        sessionID,
        message: {
          id: msg.id,
          sessionID,
          role: "user",
          cost: 0,
          tokens: { ...ZERO_TOKENS },
          time: { created: msg.time.created },
        },
        parts: msg.text ? [{ type: "text", text: msg.text }] : [],
      });
      continue;
    }
    if (msg.type !== "assistant") continue;
    out.push({
      sessionID,
      message: {
        id: msg.id,
        sessionID,
        role: "assistant",
        agent: msg.agent,
        providerID: msg.model?.providerID,
        modelID: msg.model?.id,
        cost: msg.cost ?? 0,
        tokens: totalizeTokens(msg.tokens),
        time: { created: msg.time.created },
      },
      parts: msg.content.flatMap((content) => normalizeV2Content(content, sessionID, msg.id)),
    });
  }
  return out;
}

function normalizeV2Content(
  content: SessionMessageAssistant["content"][number],
  sessionID: string,
  messageID: string,
): NormalizedPart[] {
  switch (content.type) {
    case "text":
      return [{ type: "text", text: content.text }];
    case "reasoning":
      return [
        {
          type: "reasoning",
          text: content.text,
          time: content.time
            ? { start: content.time.created, end: content.time.completed }
            : undefined,
        },
      ];
    case "tool":
      return [
        {
          type: "tool",
          id: content.id,
          sessionID,
          messageID,
          tool: content.name,
          callID: content.id,
          state: normalizeV2ToolState(content.state),
        },
      ];
  }
}

function normalizeV2ToolState(state: SessionMessageAssistantTool["state"]): NormalizedToolPart["state"] {
  switch (state.status) {
    case "streaming":
      // streaming.input 是未解析的 JSON 字符串；折叠为 pending + 空输入，与 v1 视觉一致。
      return { status: "pending", input: {}, output: "", error: "" };
    case "running":
      return { status: "running", input: state.input, output: "", error: "" };
    case "completed":
      return {
        status: "completed",
        input: state.input,
        output: toolContentToText(state.content),
        error: "",
      };
    case "error":
      return { status: "error", input: state.input, output: "", error: state.error.message };
  }
}

function toolContentToText(content: readonly ToolContent[] | undefined): string {
  if (!content) return "";
  return content
    .map((item) => (item.type === "text" ? item.text : `[file] ${item.name ?? item.uri}`))
    .join("\n");
}
