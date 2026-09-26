import { describe, expect, test } from "bun:test";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { OpenCodeClient, SessionInfo } from "@opencode/client";
import { createV1DataSource } from "./v1DataSource";
import { createV2DataSource } from "./v2DataSource";

/**
 * 4.2 验证：同一棵合成会话树（root + 2 children + 1 grandchild，超过一页）
 * 分别喂给 v1（session.children）与 v2（session.list({parentID}) + cursor 翻页）
 * 数据源，断言两者取回的集合与顺序一致；并覆盖深度上限。
 */

interface TreeSpec {
  [sessionID: string]: string[]; // parentID → child ids
}

const TREE: TreeSpec = {
  root: ["child-a", "child-b"],
  "child-a": ["grand-a"],
  "child-b": [],
  "grand-a": [],
};

function sessionInfo(id: string): SessionInfo {
  return {
    id,
    parentID: id === "root" ? undefined : id.startsWith("child") ? "root" : "child-a",
    time: { created: 1, updated: 2 },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  } as unknown as SessionInfo;
}

function fakeV1Client(): OpencodeClient {
  return {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({ data: sessionInfo(sessionID) }),
      children: async ({ sessionID }: { sessionID: string }) => ({
        data: (TREE[sessionID] ?? []).map(sessionInfo),
      }),
      messages: async () => ({ data: [] }),
    },
  } as unknown as OpencodeClient;
}

/** v2：list 每次只返回 1 条并用 cursor.next 翻页，验证翻页循环。 */
function fakeV2Client(): OpenCodeClient {
  return {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => sessionInfo(sessionID),
      list: async ({ parentID, cursor }: { parentID?: string; cursor?: string }) => {
        const children = TREE[parentID ?? ""] ?? [];
        const index = cursor ? Number(cursor) : 0;
        const page = children.slice(index, index + 1);
        const next = index + 1 < children.length ? String(index + 1) : null;
        return { data: page.map(sessionInfo), cursor: { previous: null, next } };
      },
      context: async () => [],
    },
  } as unknown as OpenCodeClient;
}

describe("session tree parity (v1 children vs v2 list({parentID}) + cursor)", () => {
  test("both data sources return the same session set and BFS order", async () => {
    const v1 = await createV1DataSource(fakeV1Client()).getTree("root");
    const v2 = await createV2DataSource(fakeV2Client()).getTree("root");

    const ids = (tree: { id: string }[]) => tree.map((s) => s.id);
    expect(ids(v1)).toEqual(["root", "child-a", "child-b", "grand-a"]);
    expect(ids(v2)).toEqual(ids(v1));
    expect(v2.map((s) => s.parentID)).toEqual([undefined, "root", "root", "child-a"]);
  });

  test("depth is capped at MAX_TREE_DEPTH (4) on both sides", async () => {
    const deep: TreeSpec = { root: ["n1"], n1: ["n2"], n2: ["n3"], n3: ["n4"], n4: ["n5"] };
    const v1 = createV1DataSource({
      session: {
        get: async ({ sessionID }: { sessionID: string }) => ({ data: sessionInfo(sessionID) }),
        children: async ({ sessionID }: { sessionID: string }) => ({
          data: (deep[sessionID] ?? []).map(sessionInfo),
        }),
        messages: async () => ({ data: [] }),
      },
    } as unknown as OpencodeClient);
    const v2 = createV2DataSource({
      session: {
        get: async ({ sessionID }: { sessionID: string }) => sessionInfo(sessionID),
        list: async ({ parentID }: { parentID?: string }) => ({
          data: (deep[parentID ?? ""] ?? []).map(sessionInfo),
          cursor: { previous: null, next: null },
        }),
        context: async () => [],
      },
    } as unknown as OpenCodeClient);

    const ids = (tree: { id: string }[]) => tree.map((s) => s.id);
    // depth 0=root … 4=n4：depth 4 的节点本身会纳入，但不再展开其子节点（n5 不出现）
    expect(ids(await v1.getTree("root"))).toEqual(["root", "n1", "n2", "n3", "n4"]);
    expect(ids(await v2.getTree("root"))).toEqual(ids(await v1.getTree("root")));
  });

  test("fetch failures degrade to empty results (no throw)", async () => {
    const failingV1 = createV1DataSource({
      session: {
        get: async () => {
          throw new Error("boom");
        },
        children: async () => {
          throw new Error("boom");
        },
        messages: async () => {
          throw new Error("boom");
        },
      },
    } as unknown as OpencodeClient);
    const failingV2 = createV2DataSource({
      session: {
        get: async () => {
          throw new Error("boom");
        },
        list: async () => {
          throw new Error("boom");
        },
        context: async () => {
          throw new Error("boom");
        },
      },
    } as unknown as OpenCodeClient);

    expect(await failingV1.getTree("root")).toEqual([]);
    expect(await failingV2.getTree("root")).toEqual([]);
    expect(await failingV1.fetchMessages("root")).toEqual([]);
    expect(await failingV2.fetchMessages("root")).toEqual([]);
  });
});
