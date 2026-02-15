import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@giselle-internal/ui/table";
import { DemoSection } from "../components/demo-section";
import { UiPage } from "../components/ui-page";

export default function () {
	return (
		<UiPage title="Table">
			<DemoSection label="Demo">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<TableRow>
							<TableCell>John Doe</TableCell>
							<TableCell>john@example.com</TableCell>
							<TableCell>Admin</TableCell>
						</TableRow>
						<TableRow>
							<TableCell>Jane Doe</TableCell>
							<TableCell>jane@example.com</TableCell>
							<TableCell>User</TableCell>
						</TableRow>
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell colSpan={3}>Total: 2</TableCell>
						</TableRow>
					</TableFooter>
					<TableCaption>Demo table</TableCaption>
				</Table>
			</DemoSection>
		</UiPage>
	);
}
