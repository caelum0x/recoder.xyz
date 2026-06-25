import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext7Docs } from "../docs/context7-docs";
import type { FetchImpl, FetchResponse } from "../docs/context7-docs";

/** Build a 200 FetchResponse whose json() yields the given body. */
function ok(body: unknown): FetchResponse {
  return { ok: true, status: 200, json: async () => body };
}

/** A search response resolving to one library id. */
const searchBody = {
  results: [
    { id: "/facebook/react", title: "React", description: "A UI library" },
    { id: "/other/lib", title: "Other", description: "ignored" },
  ],
};

/** A context response with one code snippet and one info snippet. */
const contextBody = {
  codeSnippets: [
    {
      codeTitle: "useState",
      codeDescription: "React state hook",
      codeList: [{ language: "tsx", code: "const [n, set] = useState(0)" }],
      codeId: "https://react.dev/useState",
    },
  ],
  infoSnippets: [
    {
      content: "Hooks let you use state in function components.",
      breadcrumb: "React > Hooks",
      pageId: "hooks-intro",
    },
  ],
};

test("lookup resolves a library then maps context snippets to BrainDoc[]", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    return url.includes("v2/libs/search") ? ok(searchBody) : ok(contextBody);
  };

  const docs = createContext7Docs({ fetchImpl, apiKey: "ctx7sk-test" });
  const out = await docs.lookup("how do react hooks work", 10);

  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    library: "/facebook/react",
    title: "useState",
    url: "https://react.dev/useState",
    snippet:
      "React state hook\n\n```tsx\nconst [n, set] = useState(0)\n```",
  });
  assert.equal(out[1].library, "/facebook/react");
  assert.equal(out[1].title, "React > Hooks");
  assert.equal(out[1].snippet, "Hooks let you use state in function components.");
  // pageId is not a URL -> url omitted.
  assert.equal(out[1].url, undefined);
});

test("lookup sends query + libraryName and a Bearer key on search", async () => {
  let searchUrl = "";
  let authHeader = "";
  const fetchImpl: FetchImpl = async (url, init) => {
    if (url.includes("v2/libs/search")) {
      searchUrl = url;
      authHeader = init?.headers?.["Authorization"] ?? "";
      return ok(searchBody);
    }
    return ok(contextBody);
  };

  await createContext7Docs({ fetchImpl, apiKey: "ctx7sk-abc" }).lookup(
    "redux toolkit",
    5,
  );

  assert.ok(searchUrl.includes("v2/libs/search"));
  assert.ok(searchUrl.includes("query=redux+toolkit"));
  assert.ok(searchUrl.includes("libraryName=redux+toolkit"));
  assert.equal(authHeader, "Bearer ctx7sk-abc");
});

test("lookup honors the limit", async () => {
  const fetchImpl: FetchImpl = async (url) =>
    url.includes("v2/libs/search") ? ok(searchBody) : ok(contextBody);
  const out = await createContext7Docs({ fetchImpl, apiKey: "k" }).lookup(
    "react",
    1,
  );
  assert.equal(out.length, 1);
});

test("missing API key degrades to [] without any fetch attempt", async () => {
  let attempted = false;
  const fetchImpl: FetchImpl = async () => {
    attempted = true;
    return ok(searchBody);
  };
  const out = await createContext7Docs({ fetchImpl, apiKey: "" }).lookup(
    "react",
    5,
  );
  assert.deepEqual(out, []);
  assert.equal(attempted, false);
});

test("fetch throwing degrades to []", async () => {
  const fetchImpl: FetchImpl = async () => {
    throw new Error("network down");
  };
  const out = await createContext7Docs({ fetchImpl, apiKey: "k" }).lookup(
    "react",
    5,
  );
  assert.deepEqual(out, []);
});

test("non-200 on search degrades to []", async () => {
  const fetchImpl: FetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: "unauthorized" }),
  });
  const out = await createContext7Docs({ fetchImpl, apiKey: "k" }).lookup(
    "react",
    5,
  );
  assert.deepEqual(out, []);
});

test("non-200 on context degrades to []", async () => {
  const fetchImpl: FetchImpl = async (url) =>
    url.includes("v2/libs/search")
      ? ok(searchBody)
      : { ok: false, status: 500, json: async () => ({}) };
  const out = await createContext7Docs({ fetchImpl, apiKey: "k" }).lookup(
    "react",
    5,
  );
  assert.deepEqual(out, []);
});

test("no library match degrades to [] (context never fetched)", async () => {
  let contextFetched = false;
  const fetchImpl: FetchImpl = async (url) => {
    if (url.includes("v2/libs/search")) {
      return ok({ results: [] });
    }
    contextFetched = true;
    return ok(contextBody);
  };
  const out = await createContext7Docs({ fetchImpl, apiKey: "k" }).lookup(
    "nonexistent",
    5,
  );
  assert.deepEqual(out, []);
  assert.equal(contextFetched, false);
});

test("unparseable JSON degrades to []", async () => {
  const fetchImpl: FetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("invalid json");
    },
  });
  const out = await createContext7Docs({ fetchImpl, apiKey: "k" }).lookup(
    "react",
    5,
  );
  assert.deepEqual(out, []);
});

test("empty query degrades to [] without fetch", async () => {
  let attempted = false;
  const fetchImpl: FetchImpl = async () => {
    attempted = true;
    return ok(searchBody);
  };
  const out = await createContext7Docs({ fetchImpl, apiKey: "k" }).lookup("", 5);
  assert.deepEqual(out, []);
  assert.equal(attempted, false);
});
