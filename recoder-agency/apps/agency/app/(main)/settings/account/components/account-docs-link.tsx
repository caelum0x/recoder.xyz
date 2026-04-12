"use client";

import { DocsLink } from "@recoder-internal/ui/docs-link";
import { usePathname } from "next/navigation";

const DOCS_LINKS = {
	"/settings/account": {
		href: "https://docs.recoder.xyz",
		label: "About Account Overview",
	},
	"/settings/account/general": {
		href: "https://docs.recoder.xyz",
		label: "About Account Settings",
	},
	"/settings/account/authentication": {
		href: "https://docs.recoder.xyz",
		label: "About Authentication",
	},
} as const;

export function AccountDocsLink() {
	const pathname = usePathname();
	const docsLink =
		DOCS_LINKS[pathname as keyof typeof DOCS_LINKS] ||
		DOCS_LINKS["/settings/account"];

	return (
		<DocsLink href={docsLink.href} target="_blank" rel="noopener noreferrer">
			{docsLink.label}
		</DocsLink>
	);
}
