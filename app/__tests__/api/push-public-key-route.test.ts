describe("/api/push/public-key route", () => {
	beforeEach(() => {
		vi.resetModules();
		delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
	});

	it("returns success=false when VAPID public key is not configured", async () => {
		const { GET } = await import("@/app/api/push/public-key/route");
		const response = await GET();
		expect(response.status).toBe(200);

		const json = await response.json();
		expect(json.success).toBe(false);
		expect(json.publicKey).toBeNull();
		expect(json.message).toContain("not configured");
	});

	it("returns success=true and key when VAPID public key is configured", async () => {
		process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BEXAMPLE_PUBLIC_KEY";

		const { GET } = await import("@/app/api/push/public-key/route");
		const response = await GET();
		expect(response.status).toBe(200);

		const json = await response.json();
		expect(json.success).toBe(true);
		expect(json.publicKey).toBe("BEXAMPLE_PUBLIC_KEY");
		expect(json.message).toContain("loaded");
	});
});
