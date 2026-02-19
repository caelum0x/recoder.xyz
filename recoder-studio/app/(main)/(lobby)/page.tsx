import { notFound } from "next/navigation";
import { stageV2Flag } from "@/flags";
import { RECODER_AI_STUDIO_USE_CASES } from "@recoder/ecosystem-config";
import { UseCaseBootstrapGrid } from "./use-case-bootstrap-grid";

export default async function LobyPage() {
	const enableStageV2 = await stageV2Flag();
	if (!enableStageV2) {
		return notFound();
	}

	return (
		<div className="px-6 py-6 md:px-10 md:py-10 text-text">
			<section className="mb-8">
				<div className="h-32 md:h-40 w-full rounded-[12px] bg-surface/30 border border-border/10 grid place-items-center">
					<span className="text-text/60 text-sm">Tutorial video space</span>
				</div>
			</section>

			<section className="mb-6">
				<h2 className="text-[18px] font-semibold mb-3">
					Flagship workflow
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<button
						type="button"
						className="rounded-[8px] h-20 bg-surface/30 border border-border/10 text-left px-4"
					>
						Design
					</button>
					<button
						type="button"
						className="rounded-[8px] h-20 bg-surface/30 border border-border/10 text-left px-4"
					>
						Simulate
					</button>
					<button
						type="button"
						className="rounded-[8px] h-20 bg-surface/30 border border-border/10 text-left px-4"
					>
						Deploy + Observe
					</button>
				</div>
			</section>

			<section className="mb-6">
				<h2 className="text-[18px] font-semibold mb-3">Playbook Templates</h2>
				<UseCaseBootstrapGrid useCases={RECODER_AI_STUDIO_USE_CASES.slice(0, 3)} />
			</section>

			<section>
				<h2 className="text-[18px] font-semibold mb-3">Create workflow</h2>
				<div className="rounded-[8px] h-20 bg-surface/30 border border-border/10 grid place-items-center">
					<button type="button" className="text-link-muted hover:underline">
						+ create
					</button>
				</div>
			</section>
		</div>
	);
}
