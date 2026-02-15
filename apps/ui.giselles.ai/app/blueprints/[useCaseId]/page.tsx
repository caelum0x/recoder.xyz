import { notFound } from "next/navigation";
import {
	RECODER_AI_STUDIO_USE_CASES,
	RECODER_ECOSYSTEM_URLS,
	resolveWorkflowRequiredSources,
} from "@recoder/ecosystem-config";

export function generateStaticParams() {
	return RECODER_AI_STUDIO_USE_CASES.map((uc) => ({ useCaseId: uc.id }));
}

export default async function BlueprintDetailPage({
	params,
}: {
	params: Promise<{ useCaseId: string }>;
}) {
	const { useCaseId } = await params;
	const useCase = RECODER_AI_STUDIO_USE_CASES.find(
		(uc) => uc.id === useCaseId,
	);
	if (!useCase) notFound();

	const bp = useCase.workflowBlueprint;
	const sources = resolveWorkflowRequiredSources(bp);
	const launchPath = `${useCase.studioPath}${
		useCase.studioPath.includes("?") ? "&" : "?"
	}useCaseId=${encodeURIComponent(useCase.id)}`;

	return (
		<div className="space-y-6">
			{/* Header */}
			<section className="rounded-2xl border border-border bg-bg/60 p-6">
				<div className="flex items-center justify-between gap-3 mb-2">
					<h1 className="text-2xl font-semibold text-inverse">
						{useCase.title}
					</h1>
					<span className="rounded-md border border-border px-2 py-1 text-[11px] text-link-muted">
						{useCase.targetTeam}
					</span>
				</div>
				<div className="flex flex-wrap gap-2 mb-3">
					{useCase.tags.map((tag) => (
						<span
							key={tag}
							className="rounded-md bg-primary-100/10 px-2 py-1 text-[11px] text-primary-100"
						>
							{tag}
						</span>
					))}
				</div>
				<p className="text-sm text-link-muted">{useCase.summary}</p>
				<p className="text-xs text-link-muted/90 mt-2">
					<span className="text-inverse">Flow:</span>{" "}
					{useCase.automationFlow}
				</p>
			</section>

			{/* Objective */}
			<section className="rounded-xl border border-border bg-bg/50 p-5">
				<h2 className="text-sm font-semibold text-inverse mb-2">
					Objective
				</h2>
				<p className="text-sm text-link-muted">{bp.objective}</p>
			</section>

			{/* Success Criteria */}
			<section className="rounded-xl border border-border bg-bg/50 p-5">
				<h2 className="text-sm font-semibold text-inverse mb-2">
					Success Criteria
				</h2>
				<ul className="space-y-1">
					{bp.successCriteria.map((item) => (
						<li
							key={item}
							className="flex items-start gap-2 text-sm text-link-muted"
						>
							<span className="text-primary-100 mt-0.5">&#x2713;</span>
							{item}
						</li>
					))}
				</ul>
			</section>

			{/* Simulation Checks */}
			<section className="rounded-xl border border-border bg-bg/50 p-5">
				<h2 className="text-sm font-semibold text-inverse mb-2">
					Simulation Checks
				</h2>
				<ul className="space-y-1">
					{bp.simulationChecks.map((item) => (
						<li
							key={item}
							className="flex items-start gap-2 text-sm text-link-muted"
						>
							<span className="text-primary-100 mt-0.5">&#x2713;</span>
							{item}
						</li>
					))}
				</ul>
			</section>

			{/* Deploy Checklist */}
			<section className="rounded-xl border border-border bg-bg/50 p-5">
				<h2 className="text-sm font-semibold text-inverse mb-2">
					Deploy Checklist
				</h2>
				<ul className="space-y-1">
					{bp.deployChecklist.map((item) => (
						<li
							key={item}
							className="flex items-start gap-2 text-sm text-link-muted"
						>
							<span className="text-primary-100 mt-0.5">&#x2713;</span>
							{item}
						</li>
					))}
				</ul>
			</section>

			{/* Required Sources */}
			{sources.length > 0 && (
				<section className="rounded-xl border border-border bg-bg/50 p-5">
					<h2 className="text-sm font-semibold text-inverse mb-2">
						Required Sources
					</h2>
					<div className="flex flex-wrap gap-2">
						{sources.map((source) => (
							<span
								key={source}
								className="rounded-md border border-primary-100/40 bg-primary-100/10 px-2 py-1 text-[11px] text-primary-100"
							>
								{source}
							</span>
						))}
					</div>
				</section>
			)}

			{/* Starter Prompt */}
			<section className="rounded-xl border border-border bg-bg/50 p-5">
				<h2 className="text-sm font-semibold text-inverse mb-2">
					Starter Prompt
				</h2>
				<pre className="rounded-lg border border-border bg-bg/80 p-4 text-sm text-link-muted whitespace-pre-wrap font-mono">
					{useCase.starterPrompt}
				</pre>
			</section>

			{/* CTA */}
			<div>
				<a
					className="inline-flex rounded-lg border border-primary-100/40 px-4 py-2.5 text-sm font-medium text-primary-100 hover:bg-primary-100/10"
					href={`${RECODER_ECOSYSTEM_URLS.studio}${launchPath}`}
					target="_blank"
					rel="noreferrer"
				>
					Open in Recoder Studio
				</a>
			</div>
		</div>
	);
}
