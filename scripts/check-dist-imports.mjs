#!/usr/bin/env node
/**
 * 构建产物检查：dist 的静态 import 清单不得包含宿主类型包。
 *
 * 规则：
 * - 禁止出现 `@opencode/plugin`（v2 宿主才映射该模块，v1 下不可解析）
 * - 禁止出现 `@opencode-ai/plugin` / `@opencode-ai/sdk`（仅允许 `import type`，编译期擦除）
 * - 允许的运行时依赖：solid-js / solid-js/store / @opentui/*
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distFile = join(root, "dist", "index.js");
const FORBIDDEN = ["@opencode/plugin", "@opencode-ai/plugin", "@opencode-ai/sdk"];
const ALLOWED_PREFIXES = ["solid-js", "@opentui/"];

const source = readFileSync(distFile, "utf8");
const specifiers = new Set();
const staticImport = /^\s*import\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm;
const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
for (const re of [staticImport, dynamicImport]) {
  let match;
  while ((match = re.exec(source)) !== null) specifiers.add(match[1]);
}

const list = [...specifiers].sort();
const forbidden = list.filter((spec) => FORBIDDEN.some((f) => spec === f || spec.startsWith(`${f}/`)));
const unexpected = list.filter(
  (spec) => !forbidden.includes(spec) && !ALLOWED_PREFIXES.some((p) => spec === p || spec.startsWith(p)) && !spec.startsWith("node:"),
);

console.log("dist 静态 import 清单:");
for (const spec of list) console.log(`  - ${spec}`);

if (forbidden.length > 0) {
  console.error(`\nFAIL: dist 出现禁止的宿主类型包导入: ${forbidden.join(", ")}`);
  process.exit(1);
}
if (unexpected.length > 0) {
  console.error(`\nFAIL: dist 出现未预期的运行时导入: ${unexpected.join(", ")}`);
  process.exit(1);
}
console.log("\nOK: 仅包含允许的运行时依赖（solid-js / @opentui/*）与 node: 内建模块。");
