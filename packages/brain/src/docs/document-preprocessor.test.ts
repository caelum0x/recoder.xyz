import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
// REAL package under test — imported genuinely, no mock of the extractor.
import * as documentPreprocessorPkg from "@recoder/document-preprocessor";
import { createDocumentPreprocessor } from "./document-preprocessor";
import { createBrain } from "../brain";
import type { MemoryPort } from "../ports/memory.port";
import type { BrainMemory } from "../domain/memory.types";

/** A sample markdown doc — the kind a RAG ingest hands the brain. */
const SAMPLE_DOC = [
  "# Deploy Runbook",
  "",
  "The   build   OOMs on the Hetzner box.",
  "Use a swapfile and cap the Node heap.",
  "",
  "",
  "",
  "Restart via PM2 after the build completes.",
].join("\n");

test("the document-preprocessor package really exports extractText", () => {
  assert.equal(typeof documentPreprocessorPkg.extractText, "function");
  assert.equal(typeof documentPreprocessorPkg.extractPdfText, "function");
});

test("preprocess runs the REAL extractor + normalizer on a markdown doc", async () => {
  const pre = createDocumentPreprocessor();
  const result = await pre.preprocess({
    title: "runbook.md",
    data: Buffer.from(SAMPLE_DOC, "utf-8"),
    format: "markdown",
  });

  assert.equal(result.title, "runbook.md");
  assert.equal(result.pageCount, 1);
  // extractText decodes the bytes faithfully (utf-8 round-trip).
  assert.equal(result.text, SAMPLE_DOC);
  assert.ok(result.text.includes("# Deploy Runbook"));
  assert.ok(result.text.includes("Restart via PM2 after the build completes."));
});

test("preprocess decodes raw bytes through the package (utf-8 round-trip)", async () => {
  const pre = createDocumentPreprocessor();
  const utf8 = "Héllo — café ☕ 你好";
  const result = await pre.preprocess({
    title: "unicode.txt",
    data: Buffer.from(utf8, "utf-8"),
  });
  assert.equal(result.text, utf8);
});

test("brain.ingestDocument preprocesses a doc and remembers the clean text", async () => {
  const remembered: { text: string; metadata?: Record<string, unknown> }[] = [];
  const memory: MemoryPort = {
    async recall(): Promise<BrainMemory[]> {
      return [];
    },
    async remember(text, metadata): Promise<void> {
      remembered.push({ text, metadata });
    },
  };

  const brain = createBrain({
    memory,
    // The REAL adapter over the REAL @recoder/document-preprocessor package.
    preprocessor: createDocumentPreprocessor(),
  });

  const result = await brain.ingestDocument({
    title: "runbook.md",
    data: Buffer.from(SAMPLE_DOC, "utf-8"),
    format: "markdown",
  });

  // Brain genuinely used the package: clean text came back AND was stored.
  assert.equal(result.remembered, true);
  assert.ok(result.text.includes("# Deploy Runbook"));
  assert.equal(remembered.length, 1);
  assert.equal(remembered[0].text, result.text);
  assert.deepEqual(remembered[0].metadata, {
    kind: "document",
    title: "runbook.md",
    pageCount: 1,
  });
});

test("ingestDocument degrades safely with no preprocessor wired (no throw)", async () => {
  const brain = createBrain({});
  const result = await brain.ingestDocument({
    title: "x.md",
    data: Buffer.from("hello", "utf-8"),
  });
  assert.deepEqual(result, {
    title: "x.md",
    text: "",
    pageCount: 0,
    remembered: false,
  });
});

test("ingestDocument returns text but does not remember when no memory port", async () => {
  const brain = createBrain({ preprocessor: createDocumentPreprocessor() });
  const result = await brain.ingestDocument({
    title: "note.txt",
    data: Buffer.from("a plain note", "utf-8"),
  });
  assert.equal(result.text, "a plain note");
  assert.equal(result.remembered, false);
});

test("pdf preprocessing degrades to empty text when no wasm loader is supplied", async () => {
  const pre = createDocumentPreprocessor();
  const result = await pre.preprocess({
    title: "scan.pdf",
    data: Buffer.from("%PDF-1.4 not really a pdf", "utf-8"),
    format: "pdf",
  });
  assert.deepEqual(result, { title: "scan.pdf", text: "", pageCount: 0 });
});
