import type { NormalizedMessage, NormalizedTokens } from "./normalize";

export interface MessageTokenSummary {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

const ZERO_SUMMARY: MessageTokenSummary = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: 0,
};

export function isAssistantMessage(msg: NormalizedMessage): boolean {
  return msg.role === "assistant";
}

export function extractMessageTokens(msg: NormalizedMessage): MessageTokenSummary {
  if (!isAssistantMessage(msg)) return { ...ZERO_SUMMARY };
  const tokens: NormalizedTokens = msg.tokens;
  return {
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    reasoningTokens: tokens.reasoning,
    cacheRead: tokens.cacheRead,
    cacheWrite: tokens.cacheWrite,
    totalTokens: tokens.total,
    cost: msg.cost,
  };
}

export function getDisplayModel(msg: NormalizedMessage): string {
  if (isAssistantMessage(msg) && msg.providerID && msg.modelID) {
    return `${msg.providerID}/${msg.modelID}`;
  }
  return "User Prompt";
}
