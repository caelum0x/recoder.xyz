"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect, useMemo, useRef, useState } from "react";

type StudioInteropRolloutStage = "internal" | "beta" | "ga" | "off";

type RolloutConfig = {
	mvpFlag: boolean;
	stage: StudioInteropRolloutStage;
	killSwitch: boolean;
	rolloutPercent: number;
};

const STORAGE_KEY = "recoder_interop_enabled";
const BUCKET_KEY = "recoder_interop_rollout_bucket";
const DEFAULT_ROLLOUT: RolloutConfig = {
	mvpFlag: false,
	stage: "internal",
	killSwitch: false,
	rolloutPercent: 0,
};

function parseBoolean(value: unknown): boolean {
	if (value === true) return true;
	if (typeof value !== "string") return false;
	const normalized = value.trim().toLowerCase();
	return (
		normalized === "1" ||
		normalized === "true" ||
		normalized === "yes" ||
		normalized === "on"
	);
}

function clampPercent(value: unknown, fallback = 0): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(100, Math.max(0, Math.round(parsed)));
}

function parseRolloutStage(
	value: unknown,
	fallback: StudioInteropRolloutStage,
): StudioInteropRolloutStage {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === "internal" ||
		normalized === "beta" ||
		normalized === "ga" ||
		normalized === "off"
	) {
		return normalized;
	}
	return fallback;
}

function loadLocalEnabled(): boolean {
	if (typeof window === "undefined") return false;
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === "true" || stored === "1";
	} catch {
		return false;
	}
}

function loadOrCreateBucket(): number {
	if (typeof window === "undefined") return 100;
	try {
		const existing = Number(localStorage.getItem(BUCKET_KEY));
		if (Number.isFinite(existing) && existing >= 0 && existing <= 99) {
			return Math.floor(existing);
		}
		const next = Math.floor(Math.random() * 100);
		localStorage.setItem(BUCKET_KEY, String(next));
		return next;
	} catch {
		return 100;
	}
}

/**
 * Client-side hook that resolves the interop feature flag.
 *
 * Global server-side rollout configuration is loaded from `/api/interop/rollout`.
 * LocalStorage override only applies in `internal` stage.
 */
export function useInteropEnabled(): {
	enabled: boolean;
	toggle: () => void;
	stage: StudioInteropRolloutStage;
	canToggleInternal: boolean;
	killSwitch: boolean;
	rolloutPercent: number;
	bucket: number;
	ready: boolean;
} {
	const posthog = usePostHog();
	const envForceEnabled = useMemo(() => {
		return (
			process.env.NEXT_PUBLIC_ENABLE_INTEROP === "true" ||
			process.env.NEXT_PUBLIC_ENABLE_INTEROP === "1"
		);
	}, []);

	const [rollout, setRollout] = useState<RolloutConfig>({
		...DEFAULT_ROLLOUT,
		mvpFlag: envForceEnabled,
		stage: parseRolloutStage(
			process.env.NEXT_PUBLIC_STUDIO_INTEROP_ROLLOUT_STAGE,
			DEFAULT_ROLLOUT.stage,
		),
		killSwitch: parseBoolean(process.env.NEXT_PUBLIC_STUDIO_INTEROP_KILL_SWITCH),
		rolloutPercent: clampPercent(
			process.env.NEXT_PUBLIC_STUDIO_INTEROP_ROLLOUT_PERCENT,
			DEFAULT_ROLLOUT.rolloutPercent,
		),
	});
	const [ready, setReady] = useState(false);
	const [localEnabled, setLocalEnabled] = useState<boolean>(loadLocalEnabled);
	const [bucket, setBucket] = useState<number>(loadOrCreateBucket);
	const lastTelemetryKey = useRef<string>("");

	useEffect(() => {
		let cancelled = false;
		async function fetchRollout() {
			try {
				const response = await fetch("/api/interop/rollout", {
					cache: "no-store",
				});
				const data = (await response.json().catch(() => null)) as
					| { rollout?: Partial<RolloutConfig> }
					| null;
				if (cancelled) return;
				if (!response.ok || !data?.rollout) {
					setReady(true);
					return;
				}
				setRollout((current) => ({
					mvpFlag: parseBoolean(data.rollout?.mvpFlag ?? current.mvpFlag),
					stage: parseRolloutStage(data.rollout?.stage, current.stage),
					killSwitch: parseBoolean(data.rollout?.killSwitch ?? current.killSwitch),
					rolloutPercent: clampPercent(
						data.rollout?.rolloutPercent,
						current.rolloutPercent,
					),
				}));
			} catch {
				// Use env/default fallback when endpoint is unavailable.
			} finally {
				if (!cancelled) {
					setReady(true);
				}
			}
		}
		void fetchRollout();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		function onStorage(e: StorageEvent) {
			if (e.key === STORAGE_KEY) {
				setLocalEnabled(e.newValue === "true" || e.newValue === "1");
			} else if (e.key === BUCKET_KEY) {
				const updated = Number(e.newValue);
				if (Number.isFinite(updated) && updated >= 0 && updated <= 99) {
					setBucket(Math.floor(updated));
				}
			}
		}
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const canToggleInternal = rollout.stage === "internal" && !rollout.killSwitch;
	const enabled = useMemo(() => {
		if (rollout.killSwitch) return false;
		if (envForceEnabled) return true;
		if (!rollout.mvpFlag) return false;
		if (rollout.stage === "off") return false;
		if (rollout.stage === "ga") return true;
		if (rollout.stage === "beta") return bucket < rollout.rolloutPercent;
		return localEnabled;
	}, [bucket, envForceEnabled, localEnabled, rollout]);

	useEffect(() => {
		const checkpoint = rollout.killSwitch
			? "blocked_kill_switch"
			: !rollout.mvpFlag && !envForceEnabled
				? "blocked_mvp_flag"
				: rollout.stage === "off"
					? "blocked_stage_off"
					: rollout.stage === "beta" && !enabled
						? "blocked_rollout_percent"
						: enabled
							? "enabled"
							: "blocked_internal_toggle";
		const telemetryKey = JSON.stringify({
			checkpoint,
			stage: rollout.stage,
			enabled,
			rolloutPercent: rollout.rolloutPercent,
			bucket,
			killSwitch: rollout.killSwitch,
			mvpFlag: rollout.mvpFlag,
		});
		if (telemetryKey === lastTelemetryKey.current) {
			return;
		}
		lastTelemetryKey.current = telemetryKey;
		posthog?.capture("studio_interop_rollout_evaluated", {
			checkpoint,
			stage: rollout.stage,
			enabled,
			rolloutPercent: rollout.rolloutPercent,
			bucket,
			killSwitch: rollout.killSwitch,
			mvpFlag: rollout.mvpFlag,
			envOverride: envForceEnabled,
		});
		if (rollout.killSwitch) {
			posthog?.capture("studio_interop_blocked_kill_switch", {
				stage: rollout.stage,
			});
		} else if (!enabled) {
			posthog?.capture("studio_interop_blocked_rollout", {
				stage: rollout.stage,
				rolloutPercent: rollout.rolloutPercent,
				bucket,
			});
		} else {
			posthog?.capture("studio_interop_enabled", {
				stage: rollout.stage,
				rolloutPercent: rollout.rolloutPercent,
				bucket,
				envOverride: envForceEnabled,
			});
		}
	}, [bucket, enabled, envForceEnabled, posthog, rollout]);

	function toggle() {
		if (!canToggleInternal) return;
		const next = !localEnabled;
		try {
			if (next) {
				localStorage.setItem(STORAGE_KEY, "true");
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		} catch {
			// localStorage not available
		}
		setLocalEnabled(next);
		posthog?.capture("studio_interop_internal_toggle_changed", {
			enabled: next,
			stage: rollout.stage,
		});
	}

	return {
		enabled,
		toggle,
		stage: rollout.stage,
		canToggleInternal,
		killSwitch: rollout.killSwitch,
		rolloutPercent: rollout.rolloutPercent,
		bucket,
		ready,
	};
}
