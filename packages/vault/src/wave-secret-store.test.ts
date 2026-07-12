import { describe, expect, it, vi } from "vitest";
import {
	type CommandResult,
	type CommandRunner,
	createWaveSecretStore,
} from "./wave-secret-store";

/**
 * Fake runner that emulates the `wsh secret` CLI surface against an
 * in-memory map, matching Wave's output format
 * (apps/wave/cmd/wsh/cmd/wshcmd-secret.go).
 */
function makeFakeRunner(initial: Record<string, string> = {}): CommandRunner {
	const store = new Map<string, string>(Object.entries(initial));
	return async (args: string[]): Promise<CommandResult> => {
		const [group, action, arg] = args;
		if (group !== "secret") {
			return { code: 1, stdout: "", stderr: `unknown command: ${group}\n` };
		}
		if (action === "get") {
			const value = store.get(arg);
			if (value === undefined) {
				return { code: 1, stdout: "", stderr: `secret not found: ${arg}\n` };
			}
			return { code: 0, stdout: `${value}\n`, stderr: "" };
		}
		if (action === "set") {
			const eq = arg.indexOf("=");
			const name = arg.slice(0, eq);
			const value = arg.slice(eq + 1);
			store.set(name, value);
			return { code: 0, stdout: `secret set: ${name}\n`, stderr: "" };
		}
		if (action === "list") {
			const names = [...store.keys()];
			const stdout = names.length > 0 ? `${names.join("\n")}\n` : "";
			return { code: 0, stdout, stderr: "" };
		}
		if (action === "delete") {
			store.delete(arg);
			return { code: 0, stdout: `secret deleted: ${arg}\n`, stderr: "" };
		}
		return { code: 1, stdout: "", stderr: `unknown action: ${action}\n` };
	};
}

/** Runner that rejects, simulating `wsh` not being on PATH. */
const throwingRunner: CommandRunner = async () => {
	throw new Error("spawn wsh ENOENT");
};

/** Runner that resolves non-zero, simulating a failed CLI invocation. */
const nonZeroRunner: CommandRunner = async () => ({
	code: 127,
	stdout: "",
	stderr: "command not found: wsh\n",
});

describe("createWaveSecretStore — happy path", () => {
	it("set → get round-trips a value", async () => {
		const store = createWaveSecretStore({ run: makeFakeRunner() });
		const setResult = await store.set("OPENAI_API_KEY", "sk-test-round-trip");
		expect(setResult).toEqual({ ok: true });
		expect(await store.get("OPENAI_API_KEY")).toBe("sk-test-round-trip");
	});

	it("get returns null for an unknown secret", async () => {
		const store = createWaveSecretStore({ run: makeFakeRunner() });
		expect(await store.get("MISSING_KEY")).toBeNull();
	});

	it("list returns all stored names", async () => {
		const store = createWaveSecretStore({
			run: makeFakeRunner({ ANTHROPIC_KEY: "a", OPENAI_KEY: "b" }),
		});
		const names = await store.list();
		expect(names.sort()).toEqual(["ANTHROPIC_KEY", "OPENAI_KEY"]);
	});

	it("list returns [] when the store is empty", async () => {
		const store = createWaveSecretStore({ run: makeFakeRunner() });
		expect(await store.list()).toEqual([]);
	});

	it("delete removes a secret so get returns null afterward", async () => {
		const store = createWaveSecretStore({
			run: makeFakeRunner({ TEMP_KEY: "value" }),
		});
		expect(await store.get("TEMP_KEY")).toBe("value");
		const deleteResult = await store.delete("TEMP_KEY");
		expect(deleteResult).toEqual({ ok: true });
		expect(await store.get("TEMP_KEY")).toBeNull();
	});

	it("get strips the trailing newline the CLI appends", async () => {
		const store = createWaveSecretStore({
			run: makeFakeRunner({ MY_KEY: "no-trailing-newline" }),
		});
		expect(await store.get("MY_KEY")).toBe("no-trailing-newline");
	});
});

describe("createWaveSecretStore — degrade-safe (wsh absent / spawn throws)", () => {
	it("get returns null without throwing", async () => {
		const store = createWaveSecretStore({ run: throwingRunner });
		await expect(store.get("ANY_KEY")).resolves.toBeNull();
	});

	it("list returns [] without throwing", async () => {
		const store = createWaveSecretStore({ run: throwingRunner });
		await expect(store.list()).resolves.toEqual([]);
	});

	it("set reports ok:false with a truthful reason, never throws", async () => {
		const store = createWaveSecretStore({ run: throwingRunner });
		const result = await store.set("ANY_KEY", "value");
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("ENOENT");
	});

	it("delete reports ok:false without throwing", async () => {
		const store = createWaveSecretStore({ run: throwingRunner });
		const result = await store.delete("ANY_KEY");
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("ENOENT");
	});
});

describe("createWaveSecretStore — degrade-safe (non-zero exit)", () => {
	it("get returns null on non-zero exit", async () => {
		const store = createWaveSecretStore({ run: nonZeroRunner });
		expect(await store.get("ANY_KEY")).toBeNull();
	});

	it("list returns [] on non-zero exit", async () => {
		const store = createWaveSecretStore({ run: nonZeroRunner });
		expect(await store.list()).toEqual([]);
	});

	it("set surfaces the stderr as the failure reason", async () => {
		const store = createWaveSecretStore({ run: nonZeroRunner });
		const result = await store.set("ANY_KEY", "value");
		expect(result).toEqual({ ok: false, reason: "command not found: wsh" });
	});
});

describe("createWaveSecretStore — invalid names never hit the runner", () => {
	it("get returns null for an invalid name without invoking the runner", async () => {
		const run = vi.fn<CommandRunner>();
		const store = createWaveSecretStore({ run });
		expect(await store.get("bad name!")).toBeNull();
		expect(run).not.toHaveBeenCalled();
	});

	it("set reports ok:false for an invalid name without invoking the runner", async () => {
		const run = vi.fn<CommandRunner>();
		const store = createWaveSecretStore({ run });
		const result = await store.set("1leading-digit", "value");
		expect(result).toEqual({ ok: false, reason: "invalid secret name" });
		expect(run).not.toHaveBeenCalled();
	});

	it("delete reports ok:false for an invalid name without invoking the runner", async () => {
		const run = vi.fn<CommandRunner>();
		const store = createWaveSecretStore({ run });
		const result = await store.delete("has=equals");
		expect(result).toEqual({ ok: false, reason: "invalid secret name" });
		expect(run).not.toHaveBeenCalled();
	});
});
