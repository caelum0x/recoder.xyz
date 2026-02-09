"use client";

import { DocsLink } from "@giselle-internal/ui/docs-link";
import { usePathname } from "next/navigation";

const DOCS_LINKS = {
	"/settings/account": {
		href: "https://agency.recoder.xyz/docs/settings/account",
		label: "About Account Overview",
	},
	"/settings/account/general": {
		href: "https://agency.recoder.xyz/docs/settings/account/general",
		label: "About Account Settings",
	},
	"/settings/account/authentication": {
		href: "https://agency.recoder.xyz/docs/settings/account/authentication",
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
