import { Input } from "@giselle-internal/ui/input";
import { DemoSection } from "../components/demo-section";
import { UiPage } from "../components/ui-page";

export default function () {
	return (
		<UiPage title="Input">
			<DemoSection label="Demo">
				<Input placeholder="Type here..." />
			</DemoSection>
		</UiPage>
	);
}
