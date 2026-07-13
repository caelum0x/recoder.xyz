#!/usr/bin/env node
// A faithful in-memory `imsg rpc` daemon double for the iMessage end-to-end
// dispatch test. It is the REAL SDK seam for the iMessage adapter: the adapter's
// IMessageRpcClient spawns `imsg rpc` and speaks line-delimited JSON-RPC 2.0 over
// stdin/stdout. This script speaks that exact protocol — it reads request lines,
// and for each `send` request replies with a JSON-RPC result carrying the
// channel-native message id, exactly as the real `imsg` binary would. No part of
// the adapter's send path is mocked; only the binary at the end of the pipe is
// substituted via RECODER_IMESSAGE_CLI_PATH.
//
// Every send is appended (as JSON) to the file named by FAKE_IMSG_LOG so the test
// can assert what the real adapter actually delivered over the wire.

import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const logPath = process.env.FAKE_IMSG_LOG;
const rl = createInterface({ input: process.stdin });

let counter = 0;

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }
  const { id, method, params } = req ?? {};
  if (id === undefined || id === null) {
    return;
  }

  let result;
  if (method === "send") {
    counter += 1;
    if (logPath) {
      try {
        appendFileSync(logPath, `${JSON.stringify({ method, params })}\n`);
      } catch {
        // best-effort logging; a logging failure must not break the RPC reply
      }
    }
    result = { id: `imsg-out-${counter}` };
  } else if (method === "chats.list") {
    result = { chats: [] };
  } else {
    result = {};
  }

  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
});
