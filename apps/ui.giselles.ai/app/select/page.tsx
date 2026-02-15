import { Select } from "@giselle-internal/ui/select";
import {
	ArrowDownAZ,
	ArrowUpAZ,
	Clock,
	FileText,
	HelpCircle,
	LogOut,
	Settings,
	User,
} from "lucide-react";
import { DemoSection } from "../components/demo-section";
import { UiPage } from "../components/ui-page";

export default function () {
	return (
		<UiPage title="Select">
			<DemoSection label="Demo">
				<Select
					name="repositoryNodeId"
					options={[
						{ value: 1, label: "apple" },
						{ value: 2, label: "banana" },
						{ value: 3, label: "melon" },
						{ value: 4, label: "long long long option" },
					]}
					placeholder="Select apple..."
				/>
			</DemoSection>
			<DemoSection label="Icon Demo">
				<Select
					name="iconSelect"
					options={[
						{ value: 1, icon: <FileText />, label: "Documents" },
						{ value: 2, icon: <Settings />, label: "Settings" },
						{ value: 3, icon: <User />, label: "Profile" },
						{ value: 4, icon: <HelpCircle />, label: "Help" },
						{ value: 5, icon: <LogOut />, label: "Sign out" },
					]}
					placeholder="Select an option..."
				/>
			</DemoSection>
			<DemoSection label="Icon Demo (Updated/Sort)">
				<Select
					name="sortSelect"
					options={[
						{
							value: "date-desc",
							icon: <Clock className="h-4 w-4" />,
							label: "Updated",
						},
						{
							value: "date-asc",
							icon: <Clock className="h-4 w-4" />,
							label: "Oldest",
						},
						{
							value: "name-asc",
							icon: <ArrowDownAZ className="h-4 w-4" />,
							label: "Name (A-Z)",
						},
						{
							value: "name-desc",
							icon: <ArrowUpAZ className="h-4 w-4" />,
							label: "Name (Z-A)",
						},
					]}
					placeholder="Sort"
				/>
			</DemoSection>
		</UiPage>
	);
}
