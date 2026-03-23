"use client";

import { TabNavigation } from "@recoder-internal/ui/tab-navigation";

const LINKS = [
	{ href: "/settings/team/vector-stores", label: "Document" },
	{ href: "/settings/team/vector-stores/github", label: "GitHub" },
] as const;

export function VectorStoresSidebarMenu() {
	return <TabNavigation links={LINKS} ariaLabelPrefix="vector stores" />;
}
