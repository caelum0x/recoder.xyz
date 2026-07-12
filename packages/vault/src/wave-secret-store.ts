import { spawn } from "node:child_process";

/**
 * Result of a mutating secret-store operation (set/delete).
 *
 * Degrade-safe by construction: operations NEVER throw. When the backing
 * store is unavailable (binary missing, non-zero exit, spawn error) the
 * result reports `ok: false` with a truthful `reason` instead of faking
 * success.
 */
export interface SecretStoreResult {
	ok: boolean;
	reason?: string;
}

/**
 * Name/value secret-store port.
 *
 * This is the shape a native secret backend must satisfy to shuttle BYOK
 * secrets. It is intentionally minimal: names and values only, no
 * encryption concerns (the backend owns encryption).
 */
export interface SecretStore {
	/** Returns the secret value, or null if absent / store unavailable. */
	get(name: string): Promise<string | null>;
	/** Stores a secret. Reports a truthful status; never throws. */
	set(name: string, value: string): Promise<SecretStoreResult>;
	/** Returns known secret names, or [] if the store is unavailable. */
	list(): Promise<string[]>;
	/** Deletes a secret. Reports a truthful status; never throws. */
	delete(name: string): Promise<SecretStoreResult>;
}

/**
 * Outcome of running the backing CLI once.
 */
export interface CommandResult {
	/** Process exit code (0 = success). */
	code: number;
	stdout: string;
	stderr: string;
}

/**
 * Injectable command runner. Receives the argv to pass to the `wsh` binary
 * (excluding the binary itself). MAY reject when the binary cannot be
 * spawned (e.g. not on PATH); the adapter treats rejection as "unavailable".
 */
export type CommandRunner = (args: string[]) => Promise<CommandResult>;

export interface WaveSecretStoreOptions {
	/**
	 * Command runner. Inject a fake in tests. Defaults to a `wsh`-spawning
	 * runner. When provided, `binPath` is ignored (the runner owns the bin).
	 */
	run?: CommandRunner;
	/** Path/name of the Wave CLI binary. Defaults to `wsh`. */
	binPath?: string;
}

/**
 * Secret name validation mirrors Wave's own rule
 * (apps/wave/pkg/wconfig/secretstore.go): a letter followed by letters,
 * digits, and underscores. Rejecting invalid names up front avoids passing
 * unexpected `name=value` shapes to `wsh secret set`.
 */
const SECRET_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;

function stripTrailingNewline(value: string): string {
	return value.replace(/\r?\n$/, "");
}

function reasonFromResult(result: CommandResult): string {
	const stderr = result.stderr.trim();
	if (stderr) {
		return stderr;
	}
	return `wsh exited with code ${result.code}`;
}

function reasonFromError(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "wsh command failed";
}

/**
 * Default runner that shells out to the Wave `wsh` CLI. Spawn failures and
 * process errors reject the promise so the adapter can degrade to safe
 * defaults. Never inherits stdio (values must not leak to the parent tty).
 */
export function createWshRunner(binPath: string): CommandRunner {
	return (args: string[]) =>
		new Promise<CommandResult>((resolve, reject) => {
			let child: ReturnType<typeof spawn>;
			try {
				child = spawn(binPath, args, {
					stdio: ["ignore", "pipe", "pipe"],
				});
			} catch (error) {
				reject(error);
				return;
			}

			let stdout = "";
			let stderr = "";
			child.stdout?.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr?.on("data", (chunk) => {
				stderr += chunk.toString();
			});
			child.on("error", (error) => {
				reject(error);
			});
			child.on("close", (code) => {
				resolve({ code: code ?? 0, stdout, stderr });
			});
		});
}

/**
 * Creates a {@link SecretStore} backed by Wave's native secret storage,
 * driven through the `wsh secret` CLI. All external process interaction goes
 * through the injectable {@link CommandRunner}.
 *
 * Degrade-safe: if `wsh` is not on PATH, returns non-zero, or the secret is
 * not found, `get` returns null, `list` returns [], and `set`/`delete`
 * return `{ ok: false, reason }`. No operation throws or fabricates a value.
 */
export function createWaveSecretStore(
	options: WaveSecretStoreOptions = {},
): SecretStore {
	const binPath = options.binPath ?? "wsh";
	const run = options.run ?? createWshRunner(binPath);

	return {
		async get(name: string): Promise<string | null> {
			if (!SECRET_NAME_REGEX.test(name)) {
				return null;
			}
			try {
				const result = await run(["secret", "get", name]);
				if (result.code !== 0) {
					return null;
				}
				return stripTrailingNewline(result.stdout);
			} catch {
				return null;
			}
		},

		async set(name: string, value: string): Promise<SecretStoreResult> {
			if (!SECRET_NAME_REGEX.test(name)) {
				return { ok: false, reason: "invalid secret name" };
			}
			try {
				const result = await run(["secret", "set", `${name}=${value}`]);
				if (result.code !== 0) {
					return { ok: false, reason: reasonFromResult(result) };
				}
				return { ok: true };
			} catch (error) {
				return { ok: false, reason: reasonFromError(error) };
			}
		},

		async list(): Promise<string[]> {
			try {
				const result = await run(["secret", "list"]);
				if (result.code !== 0) {
					return [];
				}
				return result.stdout
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
			} catch {
				return [];
			}
		},

		async delete(name: string): Promise<SecretStoreResult> {
			if (!SECRET_NAME_REGEX.test(name)) {
				return { ok: false, reason: "invalid secret name" };
			}
			try {
				const result = await run(["secret", "delete", name]);
				if (result.code !== 0) {
					return { ok: false, reason: reasonFromResult(result) };
				}
				return { ok: true };
			} catch (error) {
				return { ok: false, reason: reasonFromError(error) };
			}
		},
	};
}
