import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
	VAULT_V1_PREFIX,
	parseMasterKey,
	encryptV1,
	decryptV1,
	isVaultV1,
	createNodeCryptoDriver,
} from "./node-crypto";

function makeKey(): Buffer {
	return crypto.randomBytes(32);
}

function makeKeyBase64(): string {
	return crypto.randomBytes(32).toString("base64");
}

describe("parseMasterKey", () => {
	it("returns null for undefined", () => {
		expect(parseMasterKey(undefined)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseMasterKey("")).toBeNull();
	});

	it("returns null for key that is not 32 bytes", () => {
		const shortKey = crypto.randomBytes(16).toString("base64");
		expect(parseMasterKey(shortKey)).toBeNull();
	});

	it("returns null for non-base64 garbage", () => {
		expect(parseMasterKey("not-valid-base64!!!")).toBeNull();
	});

	it("returns 32-byte Buffer for valid base64 key", () => {
		const raw = makeKeyBase64();
		const result = parseMasterKey(raw);
		expect(result).not.toBeNull();
		expect(result!.length).toBe(32);
	});
});

describe("encryptV1", () => {
	it("produces vault:v1: prefixed string", () => {
		const key = makeKey();
		const encrypted = encryptV1("hello", key);
		expect(encrypted.startsWith(VAULT_V1_PREFIX)).toBe(true);
	});

	it("produces different IVs for same plaintext", () => {
		const key = makeKey();
		const a = encryptV1("same-text", key);
		const b = encryptV1("same-text", key);
		expect(a).not.toBe(b);
	});
});

describe("decryptV1", () => {
	it("round-trips simple string", () => {
		const key = makeKey();
		const encrypted = encryptV1("hello world", key);
		expect(decryptV1(encrypted, key)).toBe("hello world");
	});

	it("round-trips JSON", () => {
		const key = makeKey();
		const json = JSON.stringify({ openai: "sk-test-123", anthropic: "sk-ant" });
		const encrypted = encryptV1(json, key);
		expect(JSON.parse(decryptV1(encrypted, key))).toEqual({
			openai: "sk-test-123",
			anthropic: "sk-ant",
		});
	});

	it("round-trips unicode", () => {
		const key = makeKey();
		const text = "Hello\nMerhaba\n\u{1F680}\u{1F30D}";
		const encrypted = encryptV1(text, key);
		expect(decryptV1(encrypted, key)).toBe(text);
	});

	it("round-trips empty string", () => {
		const key = makeKey();
		const encrypted = encryptV1("", key);
		expect(decryptV1(encrypted, key)).toBe("");
	});

	it("throws on non-vault:v1: input", () => {
		const key = makeKey();
		expect(() => decryptV1("not-a-vault-string", key)).toThrow(
			"Not a vault:v1: ciphertext",
		);
	});

	it("throws on tampered ciphertext (auth tag failure)", () => {
		const key = makeKey();
		const encrypted = encryptV1("secret data", key);

		// Flip a byte in the hex ciphertext portion
		const parts = encrypted.split(":");
		const hexPart = parts[parts.length - 1];
		const tamperedHex =
			hexPart.slice(0, 4) +
			(hexPart[4] === "a" ? "b" : "a") +
			hexPart.slice(5);
		parts[parts.length - 1] = tamperedHex;
		const tampered = parts.join(":");

		expect(() => decryptV1(tampered, key)).toThrow();
	});
});

describe("isVaultV1", () => {
	it("returns true for vault:v1: prefixed string", () => {
		expect(isVaultV1("vault:v1:abc:def")).toBe(true);
	});

	it("returns false for plain string", () => {
		expect(isVaultV1("just-a-string")).toBe(false);
	});

	it("returns false for base64", () => {
		expect(isVaultV1(Buffer.from("hello").toString("base64"))).toBe(false);
	});
});

describe("createNodeCryptoDriver", () => {
	it("throws on invalid masterKey", () => {
		expect(() => createNodeCryptoDriver({ masterKey: "too-short" })).toThrow(
			"Invalid masterKey",
		);
	});

	it("encrypt → decrypt round-trip via driver interface", async () => {
		const driver = createNodeCryptoDriver({ masterKey: makeKeyBase64() });
		const plaintext = '{"apiKey":"sk-test-12345"}';
		const encrypted = await driver.encrypt(plaintext);
		const decrypted = await driver.decrypt(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it("encrypted output is vault:v1: format", async () => {
		const driver = createNodeCryptoDriver({ masterKey: makeKeyBase64() });
		const encrypted = await driver.encrypt("test");
		expect(encrypted.startsWith(VAULT_V1_PREFIX)).toBe(true);
	});
});

describe("cross-compatibility", () => {
	it("wire format matches {prefix}{iv_hex}:{ciphertext+authTag_hex}", () => {
		const key = makeKey();
		const encrypted = encryptV1("cross-compat-test", key);

		// Strip prefix
		const rest = encrypted.slice(VAULT_V1_PREFIX.length);
		const colonIdx = rest.indexOf(":");
		expect(colonIdx).toBeGreaterThan(0);

		// IV should be 12 bytes = 24 hex chars
		const ivHex = rest.slice(0, colonIdx);
		expect(ivHex.length).toBe(24);
		expect(/^[0-9a-f]+$/.test(ivHex)).toBe(true);

		// Remaining should be hex
		const dataHex = rest.slice(colonIdx + 1);
		expect(/^[0-9a-f]+$/.test(dataHex)).toBe(true);

		// Should contain at least 16 bytes for auth tag
		expect(Buffer.from(dataHex, "hex").length).toBeGreaterThanOrEqual(16);
	});

	it("output decrypts with raw Node.js crypto (simulating old byok-key-cache)", () => {
		const key = makeKey();
		const plaintext = "legacy-compat-check";
		const encrypted = encryptV1(plaintext, key);

		// Manually decrypt using the same algorithm the old code used
		const rest = encrypted.slice(VAULT_V1_PREFIX.length);
		const colonIdx = rest.indexOf(":");
		const iv = Buffer.from(rest.slice(0, colonIdx), "hex");
		const combined = Buffer.from(rest.slice(colonIdx + 1), "hex");
		const authTag = combined.subarray(combined.length - 16);
		const encryptedBuf = combined.subarray(0, combined.length - 16);
		const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(authTag);
		const result = Buffer.concat([
			decipher.update(encryptedBuf),
			decipher.final(),
		]).toString("utf8");

		expect(result).toBe(plaintext);
	});
});
