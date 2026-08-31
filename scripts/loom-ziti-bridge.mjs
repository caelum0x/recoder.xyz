#!/usr/bin/env node
// Recoder host-to-host Loom transport over an enrolled OpenZiti service.
//
// dial: expose a private local Unix socket and bridge each connection through
//       `ziti demo zcat` to the named Ziti service.
// host: expose Loom's Unix socket on loopback only and run the Ziti host
//       tunneler. The service's host.v1 configuration must point at that port.

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

function fail(message) {
  process.stderr.write(`loom-ziti-bridge: ${message}\n`);
  process.exit(2);
}

function usage() {
  return [
    "usage:",
    "  loom-ziti-bridge.mjs dial --identity client.json --service loom-control --socket /private/path/loom-remote.sock [--ziti-bin ziti]",
    "  loom-ziti-bridge.mjs host --identity host.json --service loom-control --loom-socket /private/path/loom.sock --listen-port 19020 [--ziti-bin ziti]",
  ].join("\n");
}

function parseArgs(argv) {
  const role = argv.shift();
  if (role !== "dial" && role !== "host") fail(usage());
  const options = { role };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (!flag?.startsWith("--") || argv.length === 0) fail(usage());
    const value = argv.shift();
    options[flag.slice(2)] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name]?.trim();
  if (!value) fail(`--${name} is required\n${usage()}`);
  return value;
}

function absoluteSocket(options, name) {
  const value = required(options, name);
  if (!path.isAbsolute(value) || value === "/") fail(`--${name} must be a specific absolute path`);
  return value;
}

function validateCommon(options) {
  const identity = required(options, "identity");
  if (!path.isAbsolute(identity) || !fs.existsSync(identity)) {
    fail("--identity must name an existing absolute enrolled-identity JSON file");
  }
  const service = required(options, "service");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(service)) {
    fail("--service contains unsupported characters");
  }
  return { identity, service, zitiBin: options["ziti-bin"]?.trim() || "ziti" };
}

function prepareOwnedSocket(socketPath) {
  const parent = path.dirname(socketPath);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (fs.existsSync(socketPath)) {
    const stat = fs.lstatSync(socketPath);
    if (!stat.isSocket()) fail(`refusing to replace non-socket path ${socketPath}`);
    fs.unlinkSync(socketPath);
  }
}

function pipeBothWays(left, right) {
  left.pipe(right);
  right.pipe(left);
  left.once("error", () => right.destroy());
  right.once("error", () => left.destroy());
  left.once("close", () => right.destroy());
  right.once("close", () => left.destroy());
}

function runDial(options) {
  const { identity, service, zitiBin } = validateCommon(options);
  const socketPath = absoluteSocket(options, "socket");
  prepareOwnedSocket(socketPath);
  const children = new Set();
  const server = net.createServer((local) => {
    const child = spawn(zitiBin, ["demo", "zcat", "-i", identity, `ziti:${service}`], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    children.add(child);
    local.pipe(child.stdin);
    child.stdout.pipe(local);
    local.once("error", () => child.kill("SIGTERM"));
    child.stdin.once("error", () => local.destroy());
    child.stdout.once("error", () => local.destroy());
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", (error) => {
      process.stderr.write(`loom-ziti-bridge: ziti dial failed: ${error.message}\n`);
      local.destroy(error);
    });
    child.once("close", (code) => {
      children.delete(child);
      if (code !== 0 && code !== null) {
        process.stderr.write(`loom-ziti-bridge: ziti dial exited ${code}\n`);
      }
      local.end();
    });
    local.once("close", () => child.kill("SIGTERM"));
  });

  const shutdown = () => {
    server.close();
    for (const child of children) child.kill("SIGTERM");
    try {
      const stat = fs.lstatSync(socketPath);
      if (stat.isSocket()) fs.unlinkSync(socketPath);
    } catch {}
  };
  process.once("SIGINT", () => { shutdown(); process.exit(0); });
  process.once("SIGTERM", () => { shutdown(); process.exit(0); });
  server.once("error", (error) => fail(error.message));
  server.listen(socketPath, () => {
    fs.chmodSync(socketPath, 0o600);
    process.stdout.write(`ready role=dial service=${service} socket=${socketPath}\n`);
  });
}

function runHost(options) {
  const { identity, service, zitiBin } = validateCommon(options);
  const loomSocket = absoluteSocket(options, "loom-socket");
  const listenPort = Number(required(options, "listen-port"));
  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    fail("--listen-port must be an integer from 1 through 65535");
  }

  const server = net.createServer((local) => {
    const loom = net.createConnection(loomSocket);
    pipeBothWays(local, loom);
  });
  let tunneler;
  const shutdown = () => {
    server.close();
    tunneler?.kill("SIGTERM");
  };
  process.once("SIGINT", () => { shutdown(); process.exit(0); });
  process.once("SIGTERM", () => { shutdown(); process.exit(0); });
  server.once("error", (error) => fail(error.message));
  server.listen({ host: "127.0.0.1", port: listenPort }, () => {
    tunneler = spawn(
      zitiBin,
      ["tunnel", "host", "-i", identity, "--cli-agent=false"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    tunneler.stdout.on("data", (chunk) => process.stdout.write(chunk));
    tunneler.stderr.on("data", (chunk) => process.stderr.write(chunk));
    tunneler.once("error", (error) => fail(`ziti host failed: ${error.message}`));
    tunneler.once("close", (code) => {
      if (code !== 0 && code !== null) process.stderr.write(`loom-ziti-bridge: ziti host exited ${code}\n`);
      server.close(() => process.exit(code ?? 1));
    });
    process.stdout.write(
      `ready role=host service=${service} loomSocket=${loomSocket} loopback=127.0.0.1:${listenPort}\n`
    );
  });
}

const options = parseArgs(process.argv.slice(2));
if (options.role === "dial") runDial(options);
else runHost(options);
