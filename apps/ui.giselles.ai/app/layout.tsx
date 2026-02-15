import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import Link from "next/link";
import { RecoderIcon } from "./components/giselle-icon";
import { NavLink } from "./nav-link";
import "./globals.css";

const sections = [
	{
		label: "Blueprints",
		items: [
			{ id: "", name: "AI Studio" },
			{ id: "blueprints/agent-ops-platform", name: "Agent Ops" },
			{ id: "blueprints/support-copilot", name: "Support Copilot" },
			{ id: "blueprints/sales-outreach", name: "Sales Outreach" },
			{ id: "blueprints/content-ops", name: "Content Ops" },
			{ id: "blueprints/product-analyst", name: "Product Analyst" },
			{ id: "blueprints/knowledge-assistant", name: "Knowledge Base" },
			{ id: "blueprints/qa-automation", name: "QA Agent" },
		],
	},
	{
		label: "Components",
		items: [
			{ id: "button", name: "Button" },
			{ id: "input", name: "Input" },
			{ id: "dialog", name: "Dialog" },
			{ id: "select", name: "Select" },
			{ id: "dropdown-menu", name: "Dropdown Menu" },
			{ id: "popover", name: "Popover" },
			{ id: "toggle", name: "Toggle" },
			{ id: "table", name: "Table" },
			{ id: "toast", name: "Toast" },
			{ id: "status-badge", name: "Status Badge" },
		],
	},
];

const dmSans = DM_Sans({
	weight: "variable",
	variable: "--font-dm-sans",
	subsets: ["latin"],
});

const dmMono = DM_Mono({
	weight: ["300", "500"],
	variable: "--font-dm-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Recoder UI",
	description: "Recoder UI component library",
	icons: {
		icon: [
			{ url: "/favicon.png", sizes: "32x32" },
			{
				url: "/favicon-light.png",
				sizes: "32x32",
				media: "(prefers-color-scheme: dark)",
			},
		],
		shortcut: "/favicon.png",
		apple: "/apple-icon.png",
	},
};

export default function ({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
			<body>
				<div className="min-h-screen bg-bg font-sans">
					<div className="flex">
						<div className="w-64 border-r border-border min-h-screen">
							<div className="p-6">
								<h1 className="mb-6">
									<Link
										href="/"
										aria-label="Go to home"
										className="flex items-center gap-[3px] group"
									>
										<RecoderIcon className="text-inverse w-[24px] h-[24px] group-hover:text-primary-100 transition-colors" />
									<span className="text-inverse text-[13px] font-semibold group-hover:text-primary-100 transition-colors">
											Recoder UI
										</span>
									</Link>
								</h1>
								<nav className="gap-1 flex flex-col">
									{sections.map((section) => (
										<div key={section.label} className="mb-3">
											<p className="text-[11px] uppercase tracking-[0.15em] text-link-muted/60 mb-1 px-1 ml-6">
												{section.label}
											</p>
											{section.items.map((item) => (
												<NavLink key={item.id} pathname={`/${item.id}`}>
													{item.name}
												</NavLink>
											))}
										</div>
									))}
								</nav>
							</div>
						</div>

						<div className="flex-1 p-8">
							<main className="max-w-4xl">{children}</main>
						</div>
					</div>
				</div>
			</body>
		</html>
	);
}
