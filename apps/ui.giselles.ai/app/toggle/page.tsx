import { Toggle } from "@giselle-internal/ui/toggle";
import { DemoSection } from "../components/demo-section";
import { UiPage } from "../components/ui-page";

export default function () {
	return (
		<UiPage title="Toggle">
			<DemoSection label="Demo">
				<Toggle name="toggle" />
			</DemoSection>
			<DemoSection label="With label">
				<Toggle name="toggle">
					<label className="text-[14px]" htmlFor="hello">
						Toggle
					</label>
					<div className="flex-grow mx-[12px] h-[1px] bg-black-200/30" />
				</Toggle>
			</DemoSection>
		</UiPage>
	);
}
