"use client";

import {
	Menu,
	X,
	Home,
	LayoutGrid,
	Settings,
	Users,
	Briefcase,
	FileText,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { clsx } from "clsx/lite";

const navLinks = [
	{ href: "/lobby", label: "Lobby", icon: Home },
	{ href: "/workspaces", label: "Workspaces", icon: Briefcase },
	{ href: "/tasks", label: "Tasks", icon: FileText },
	{ href: "/playground", label: "Playground", icon: LayoutGrid },
	{ href: "/settings/account", label: "Account", icon: Settings },
	{ href: "/settings/team", label: "Team", icon: Users },
];

interface MobileMenuProps {
	children: ReactNode;
}

export function MobileMenu({ children }: MobileMenuProps) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// Close drawer on route change
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	// Prevent body scroll when drawer is open
	useEffect(() => {
		if (open) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [open]);

	return (
		<>
			{/* Hamburger button — visible only on mobile */}
			<button
				type="button"
				className="md:hidden flex items-center justify-center p-1.5 rounded-md text-inverse/70 hover:text-inverse hover:bg-white/5 transition-colors"
				onClick={() => setOpen(!open)}
				aria-label={open ? "Close menu" : "Open menu"}
			>
				{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
			</button>

			{/* Mobile overlay */}
			{open && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-40 bg-black/50 md:hidden"
						onClick={() => setOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape") setOpen(false);
						}}
						role="button"
						tabIndex={-1}
						aria-label="Close menu"
					/>

					{/* Slide-in drawer */}
					<div className="fixed top-16 right-0 z-50 w-72 h-[calc(100vh-4rem)] bg-background border-l border-border shadow-xl md:hidden overflow-y-auto">
						<nav className="flex flex-col gap-1 p-4" aria-label="Mobile navigation">
							{/* Navigation links */}
							<p className="px-3 text-[11px] text-inverse/40 uppercase tracking-wider mb-1">
								Navigate
							</p>
							{navLinks.map((link) => {
								const Icon = link.icon;
								const isActive =
									pathname === link.href ||
									(link.href !== "/" &&
										pathname.startsWith(link.href));
								return (
									<Link
										key={link.href}
										href={link.href}
										onClick={() => setOpen(false)}
										className={clsx(
											"flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
											isActive
												? "bg-primary-100/10 text-primary-100"
												: "text-inverse/60 hover:text-inverse hover:bg-white/5",
										)}
									>
										<Icon className="w-4 h-4" />
										<span>{link.label}</span>
									</Link>
								);
							})}

							<div className="border-t border-border my-3" />

							{/* Docs link */}
							<a
								href="https://docs.recoder.xyz"
								target="_blank"
								rel="noopener"
								className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-inverse/60 hover:text-inverse hover:bg-white/5 transition-colors"
								onClick={() => setOpen(false)}
							>
								<FileText className="w-4 h-4" />
								<span>Docs</span>
							</a>

							<div className="border-t border-border my-3" />

							{/* Render server-passed children (upgrade button, account menu, etc.) */}
							<div className="flex flex-col gap-2 px-3 py-1">
								{children}
							</div>
						</nav>
					</div>
				</>
			)}
		</>
	);
}
