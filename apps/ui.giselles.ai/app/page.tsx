import {
	RECODER_AI_STUDIO_USE_CASES,
	RECODER_ECOSYSTEM_URLS,
	RECODER_STUDIO_FLAGSHIP_LOOP,
	RECODER_STUDIO_POSITIONING,
} from "@recoder/ecosystem-config";

export default function HomePage() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-border bg-bg/60 p-6">
				<p className="text-xs uppercase tracking-[0.2em] text-link-muted mb-2">
					Recoder Studio
				</p>
				<h1 className="text-2xl font-semibold text-inverse mb-2">
					{RECODER_STUDIO_POSITIONING}
				</h1>
				<p className="text-sm text-link-muted max-w-3xl">
					Cursor-style environment for production AI workflows:
					Design, Simulate, Deploy, Observe, Iterate.
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
					{RECODER_STUDIO_FLAGSHIP_LOOP.map((step) => (
						<span
							key={step}
							className="rounded-md border border-primary-100/40 bg-primary-100/10 px-2 py-1 text-[11px] text-primary-100"
						>
							{step}
						</span>
					))}
				</div>
			</section>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{RECODER_AI_STUDIO_USE_CASES.map((useCase) => {
					const launchPath = `${useCase.studioPath}${
						useCase.studioPath.includes("?") ? "&" : "?"
					}useCaseId=${encodeURIComponent(useCase.id)}`;
					return (
						<article
							key={useCase.id}
							className="rounded-xl border border-border bg-bg/50 p-5"
						>
							<div className="mb-2 flex items-center justify-between gap-3">
								<h2 className="text-base font-semibold text-inverse">
									{useCase.title}
								</h2>
								<span className="rounded-md border border-border px-2 py-1 text-[11px] text-link-muted">
									{useCase.targetTeam}
								</span>
							</div>
							<p className="text-sm text-link-muted mb-3">{useCase.summary}</p>
							<p className="text-xs text-link-muted/90 mb-3">
								<span className="text-inverse">Flow:</span>{" "}
								{useCase.automationFlow}
							</p>
							<p className="text-xs text-link-muted mb-4">
								<span className="text-inverse">Starter prompt:</span>{" "}
								{useCase.starterPrompt}
							</p>
							<div className="mb-4 flex flex-wrap gap-2">
								{useCase.tags.map((tag) => (
									<span
										key={tag}
										className="rounded-md bg-primary-100/10 px-2 py-1 text-[11px] text-primary-100"
									>
										{tag}
									</span>
								))}
							</div>
							<a
								className="inline-flex rounded-lg border border-primary-100/40 px-3 py-2 text-xs font-medium text-primary-100 hover:bg-primary-100/10"
								href={`${RECODER_ECOSYSTEM_URLS.studio}${launchPath}`}
								target="_blank"
								rel="noreferrer"
							>
								Open in Recoder Studio
							</a>
						</article>
					);
				})}
			</section>
		</div>
	);
}
