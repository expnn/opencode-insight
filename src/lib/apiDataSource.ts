import type { Part, ReasoningPart, TextPart, ToolPart } from "@opencode-ai/sdk/v2";
import type { AggregatedMessage, AggregatedData } from "./sessionAggregator";
import { extractMessageTokens, getDisplayModel, isAssistantMessage } from "./tokenHelpers";

// ── Re-export aggregator types for single import surface ───────────

export type { AggregatedMessage, AggregatedData } from "./sessionAggregator";
export { aggregateSessionData, invalidateAggregationCache } from "./sessionAggregator";

// ── Interfaces ───────────────────────────────────────────────────────

export interface TimelineEntry {
  id: string;
  sessionId: string;
  type: "message" | "tool";
  timestamp: number;
  // Message fields
  agent?: string;
  model?: string;
  provider?: string;
  displayModel: string;
  role?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: number;
  // Tool fields
  toolName?: string;
  callId?: string;
  status?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  // Common
  messageId?: string;
}

export interface MessagePart {
  type: string;
  text: string;
  time?: { start: number; end?: number };
}

export interface RealTokenUsageEntry {
  id: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  model: string;
  provider: string;
  timestamp: number;
  role: string;
  agent: string;
  partTypes: string[];
}

export interface AccumulatedTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
}

export interface ToolCallEntry {
  id: string;
  messageId: string;
  sessionId: string;
  toolName: string;
  callId: string;
  status: ToolPart["state"]["status"];
  input: Record<string, unknown>;
  output: string;
  timeCreated: number;
}

// ── Type guards ─────────────────────────────────────────────────────

function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

function isReasoningPart(part: Part): part is ReasoningPart {
  return part.type === "reasoning";
}

function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool";
}

// ── Token Usage (from AggregatedMessage[]) ───────────────────────────

export function getTokenUsage(messages: AggregatedMessage[]): RealTokenUsageEntry[] {
  return messages.map((aggMsg) => {
    const msg = aggMsg.message;
    const tokens = extractMessageTokens(msg);
    const assistant = isAssistantMessage(msg);
    const partTypes = new Set<string>();
    for (const part of aggMsg.parts) {
      partTypes.add(part.type);
    }

    return {
      id: msg.id,
      sessionId: aggMsg.sessionID,
      ...tokens,
      model: assistant ? msg.modelID : "unknown",
      provider: assistant ? msg.providerID : "unknown",
      displayModel: getDisplayModel(msg),
      timestamp: msg.time.created,
      role: msg.role,
      agent: msg.agent ?? "unknown",
      partTypes: Array.from(partTypes),
    };
  });
}

// ── Message Parts (from AggregatedData, inline parts) ───────────────

/**
 * Resolve message parts from the inline AggregatedData (no api.state.part).
 * Looks up the AggregatedMessage by messageID and returns its text/reasoning parts.
 */
export function getMessagePartsFromAggregated(
  aggregated: AggregatedData,
  messageId: string,
): MessagePart[] {
  const aggMsg = aggregated.messages.find((m) => m.message.id === messageId);
  if (!aggMsg) return [];

  return aggMsg.parts
    .filter((part): part is TextPart | ReasoningPart => isTextPart(part) || isReasoningPart(part))
    .map((part) => ({
      type: part.type,
      text: part.text,
      time: part.time,
    }));
}

// ── Timeline (from AggregatedMessage[]) ──────────────────────────────

export function getTimelineData(messages: AggregatedMessage[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const aggMsg of messages) {
    const msg = aggMsg.message;
    const tokens = extractMessageTokens(msg);
    const assistant = isAssistantMessage(msg);

    entries.push({
      id: msg.id,
      sessionId: aggMsg.sessionID,
      type: "message",
      timestamp: msg.time.created,
      agent: msg.agent ?? "unknown",
      model: assistant ? msg.modelID : "unknown",
      provider: assistant ? msg.providerID : "unknown",
      displayModel: getDisplayModel(msg),
      role: msg.role,
      ...tokens,
    });

    // Use inline parts (no api.state.part)
    for (const part of aggMsg.parts) {
      if (isToolPart(part)) {
        const state = part.state;
        entries.push({
          id: part.id,
          sessionId: part.sessionID,
          displayModel: "",
          type: "tool",
          timestamp: msg.time.created,
          messageId: part.messageID,
          toolName: part.tool,
          callId: part.callID,
          status: state.status,
          toolInput: state.status !== "pending" ? state.input : {},
          toolOutput:
            state.status === "completed"
              ? state.output
              : state.status === "error"
                ? state.error
                : "",
        });
      }
    }
  }

  // Sort by time desc for display
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}

// ── Tool Calls (from AggregatedMessage[]) ────────────────────────────

export function getToolCalls(messages: AggregatedMessage[]): ToolCallEntry[] {
  const entries: ToolCallEntry[] = [];

  for (const aggMsg of messages) {
    for (const part of aggMsg.parts) {
      if (isToolPart(part)) {
        const state = part.state;
        entries.push({
          id: part.id,
          messageId: part.messageID,
          sessionId: part.sessionID,
          toolName: part.tool,
          callId: part.callID,
          status: state.status,
          input: state.status !== "pending" ? state.input : {},
          output:
            state.status === "completed"
              ? state.output
              : state.status === "error"
                ? state.error
                : "",
          timeCreated: aggMsg.message.time.created,
        });
      }
    }
  }

  return entries;
}

export function getToolCallCount(messages: AggregatedMessage[]): number {
  let count = 0;
  for (const aggMsg of messages) {
    for (const part of aggMsg.parts) {
      if (isToolPart(part)) count++;
    }
  }
  return count;
}

export function getMessageCount(messages: AggregatedMessage[]): number {
  return messages.length;
}

export interface ToolUsageStat {
  toolName: string;
  count: number;
}

export function getToolUsageStats(messages: AggregatedMessage[]): ToolUsageStat[] {
  const calls = getToolCalls(messages);
  const map = new Map<string, number>();
  for (const call of calls) {
    const name = call.toolName || "unknown";
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Agent Usage (from AggregatedMessage[]) ───────────────────────────

export interface AgentUsageStat {
  agentName: string;
  count: number;
}

/**
 * Count messages by msg.message.agent.
 * Decision: "Agents" list keeps "messages per agent" semantics.
 */
export function getAgentUsageStats(messages: AggregatedMessage[]): AgentUsageStat[] {
  const map = new Map<string, number>();
  for (const aggMsg of messages) {
    const agent = aggMsg.message.agent ?? "unknown";
    map.set(agent, (map.get(agent) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([agentName, count]) => ({ agentName, count }))
    .sort((a, b) => b.count - a.count);
}
