import { GitHubIcon } from "../../../../../icons";

export function GitHubRepositoryBlock({
	owner,
	repo,
}: {
	owner: string;
	repo: string;
}) {
	return (
		<div className="flex items-center gap-[8px] px-[4px] rounded-[4px]">
			<GitHubIcon className="size-[20px]" />
			<p className="space-x-[2px] text-[14px]">
				<span>{owner}</span>
				<span>/</span>
				<span>{repo}</span>
			</p>
		</div>
	);
}
