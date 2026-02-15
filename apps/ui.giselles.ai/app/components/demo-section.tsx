import type React from "react";

interface DemoSectionProps {
	label: string;
	children: React.ReactNode;
}

export function DemoSection({ label, children }: DemoSectionProps) {
	return (
		<div>
			<p className="text-text mb-2 text-sm">{label}</p>
			<div className="bg-transparent p-8 rounded-[4px] border border-border shadow-sm text-sans">
				<div className="space-y-4">{children}</div>
			</div>
		</div>
	);
}
