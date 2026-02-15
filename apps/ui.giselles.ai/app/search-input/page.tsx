"use client";

import { SearchInput } from "@giselle-internal/ui/search-input";
import { useState } from "react";
import { DemoSection } from "../components/demo-section";
import { UiPage } from "../components/ui-page";

export default function Page() {
	const [value, setValue] = useState("");
	return (
		<UiPage title="SearchInput">
			<DemoSection label="Default">
				<div className="max-w-md w-full">
					<SearchInput
						placeholder="Search..."
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
				</div>
			</DemoSection>
			<DemoSection label="Custom">
				<div className="grid gap-3 max-w-md w-full">
					<SearchInput className="rounded-[4px]" placeholder="Smaller radius" />
					<SearchInput iconClassName="hidden" placeholder="No icon" />
				</div>
			</DemoSection>
		</UiPage>
	);
}
