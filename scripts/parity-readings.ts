/**
 * 双 runtime 数字对拍脚本：同一份聚合/derive 代码分别跑 v1 与 v2 数据源。
 *
 * 用法：
 *   bun run scripts/parity-readings.ts v1 <baseUrl> <rootSessionID>
 *   bun run scripts/parity-readings.ts v2 <baseUrl> <rootSessionID>
 *
 * 输出 JSON：sessions / messages / toolCalls / totalTokens / cost / cacheHitPct。
 * 该脚本复用插件自身的聚合与 derive 代码（src/lib/*），保证与 UI 读数同源。
 */
import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { OpenCode } from "@opencode/client";
import { createV1DataSource } from "../src/lib/v1DataSource";
import { createV2DataSource } from "../src/lib/v2DataSource";
import { aggregateSessionData, type AggregatedData, type DataSource } from "../src/lib/sessionAggregator";
import {
  getMessageCount,
  getSidebarStats,
  getToolCallCount,
  getTokenUsage,
} from "../src/lib/apiDataSource";

interface Readings {
  runtime: string;
  rootSessionID: string;
  sessions: number;
  messages: number;
  toolCalls: number;
  totalTokens: number;
  cost: number;
  cacheHitPct: string;
  hasData: boolean;
}

async function read(mode: "v1" | "v2", baseUrl: string, rootSessionID: string): Promise<Readings> {
  // v2 服务使用 HTTP Basic（用户名固定 `opencode` + service.json 的 password）；
  // v1 服务默认无密码，设置该变量不影响 v1。
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  const headers = password
    ? { authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") }
    : undefined;
  const source: DataSource =
    mode === "v1"
      ? createV1DataSource(createOpencodeClient({ baseUrl, headers }))
      : createV2DataSource(OpenCode.make({ baseUrl, headers }));

  const data: AggregatedData = await aggregateSessionData(source, rootSessionID);
  const stats = getSidebarStats(data);
  const usage = getTokenUsage(data.messages);
  const acc = usage.reduce(
    (sum, entry) => ({
      total: sum.total + entry.totalTokens,
      cost: sum.cost + entry.cost,
    }),
    { total: 0, cost: 0 },
  );
  return {
    runtime: mode,
    rootSessionID,
    sessions: data.sessions.length,
    messages: getMessageCount(data.messages),
    toolCalls: getToolCallCount(data.messages),
    totalTokens: acc.total,
    cost: acc.cost,
    cacheHitPct: stats.cacheHitPct,
    hasData: stats.hasData,
  };
}

async function main(): Promise<void> {
  const [mode, baseUrl, rootSessionID] = process.argv.slice(2);
  if ((mode !== "v1" && mode !== "v2") || !baseUrl || !rootSessionID) {
    console.error("usage: bun run scripts/parity-readings.ts <v1|v2> <baseUrl> <rootSessionID>");
    process.exit(2);
  }
  const readings = await read(mode, baseUrl, rootSessionID);
  console.log(JSON.stringify(readings, null, 2));
}

void main();
