"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../components/button";
import { Card } from "../components/card";

type DashboardSummary = {
	ready: number;
	ingesting: number;
	setupRequired: number;
	totalLaunches: number;
};

type DashboardResponse = {
	summary: DashboardSummary;
};

const POLL_INTERVAL_MS = 30000;

export function UseCaseDashboardLive() {
	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const loadDashboard = useCallback(async () => {
		try {
			setErrorMessage(null);
			const response = await fetch("/api/use-cases/dashboard", {
				cache: "no-store",
			});
			if (!response.ok) {
				throw new Error(`Failed to fetch dashboard: ${response.status}`);
			}
			const data = (await response.json()) as DashboardResponse;
			setSummary(data.summary);
			setLastUpdatedAt(new Date());
		} catch (error) {
			console.error(error);
			setErrorMessage("Failed to refresh live dashboard.");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadDashboard();
		const timer = setInterval(() => {
			void loadDashboard();
		}, POLL_INTERVAL_MS);
		return () => {
			clearInterval(timer);
		};
	}, [loadDashboard]);

	const formattedLastUpdated = useMemo(() => {
		if (!lastUpdatedAt) return "Not yet updated";
		return lastUpdatedAt.toLocaleTimeString();
	}, [lastUpdatedAt]);

	return (
		<Card
			title="Live Workflow Ops Monitor"
			description="Auto-refreshes every 30 seconds from /api/use-cases/dashboard."
			action={{
				component: (
					<Button type="button" onClick={() => void loadDashboard()}>
						Refresh now
					</Button>
				),
			}}
		>
			<div className="grid gap-2">
				<p className="text-[11px] text-text/60">Last updated: {formattedLastUpdated}</p>
				{errorMessage ? (
					<p className="text-xs text-error-900">{errorMessage}</p>
				) : null}
				{isLoading ? (
					<p className="text-xs text-text/60">Loading live dashboard...</p>
				) : summary ? (
					<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
						<Metric label="Ready" value={summary.ready} valueClass="text-emerald-300" />
						<Metric
							label="Ingesting"
							value={summary.ingesting}
							valueClass="text-amber-300"
						/>
						<Metric
							label="Setup Required"
							value={summary.setupRequired}
							valueClass="text-orange-300"
						/>
						<Metric
							label="Template Launches"
							value={summary.totalLaunches}
							valueClass="text-primary-100"
						/>
					</div>
				) : (
					<p className="text-xs text-text/60">No dashboard data.</p>
				)}
			</div>
		</Card>
	);
}

function Metric({
	label,
	value,
	valueClass,
}: {
	label: string;
	value: number;
	valueClass: string;
}) {
	return (
		<div className="rounded-md border border-border/80 bg-surface/15 px-3 py-2">
			<p className="text-[11px] text-text/60">{label}</p>
			<p className={`text-sm font-medium ${valueClass}`}>{value}</p>
		</div>
	);
}
