import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import {
	container,
	EmailFonts,
	EmailFooter,
	EmailHeader,
	h1,
	highlightText,
	link,
	main,
	section,
	signatureText,
	text,
	topBorder,
	topBorderSection,
} from "../components";

interface ProjectSummary {
	name: string;
	status: string;
	recentDeliverables: string[];
	pendingDecisions: number;
	portalUrl: string;
}

interface ClientDigestEmailProps {
	clientName?: string;
	projects?: ProjectSummary[];
	portalBaseUrl?: string;
}

export const ClientDigestEmail = ({
	clientName,
	projects,
	portalBaseUrl,
}: ClientDigestEmailProps) => {
	const displayClientName = clientName ?? "{{ client_name }}";
	const displayProjects = projects ?? [
		{
			name: "Sample Project",
			status: "in_progress",
			recentDeliverables: ["Homepage design", "API integration"],
			pendingDecisions: 2,
			portalUrl: "{{ portal_url }}",
		},
	];
	const displayPortalBaseUrl = portalBaseUrl ?? "{{ portal_base_url }}";

	return (
		<Html>
			<Head>
				<EmailFonts />
			</Head>
			<Preview>Weekly project update for {displayClientName}</Preview>
			<Body style={main}>
				<Container style={container}>
					<EmailHeader
						heading="Weekly Update"
						subheading="Here's what happened with your projects this week."
					/>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
					<Section style={section}>
						<Heading style={h1}>
							Hi <span style={highlightText}>{displayClientName}</span>
						</Heading>
						<Text style={text}>
							Here is your weekly project status summary.
						</Text>

						{displayProjects.map((project) => (
							<div key={project.name} style={{ marginBottom: "24px" }}>
								<Text
									style={{
										...text,
										fontWeight: 600,
										marginBottom: "4px",
									}}
								>
									{project.name}{" "}
									<span style={{ fontWeight: 400, opacity: 0.7 }}>
										({project.status.replace("_", " ")})
									</span>
								</Text>
								{project.recentDeliverables.length > 0 && (
									<Text style={{ ...text, marginTop: "4px" }}>
										Recent deliverables: {project.recentDeliverables.join(", ")}
									</Text>
								)}
								{project.pendingDecisions > 0 && (
									<Text
										style={{
											...text,
											marginTop: "4px",
											fontWeight: 600,
										}}
									>
										{project.pendingDecisions} pending decision
										{project.pendingDecisions !== 1 ? "s" : ""} awaiting your
										review
									</Text>
								)}
								<Text style={{ ...text, marginTop: "4px" }}>
									<Link href={project.portalUrl} style={link}>
										View in portal
									</Link>
								</Text>
							</div>
						))}

						<Text style={text}>
							<Link href={displayPortalBaseUrl} style={link}>
								Go to portal
							</Link>
						</Text>
						<Text style={signatureText}>
							&mdash;
							<br />
							Recoder Agency
						</Text>
					</Section>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
};

ClientDigestEmail.PreviewProps = {
	clientName: "Jane Doe",
	projects: [
		{
			name: "Landing Page Redesign",
			status: "client_review",
			recentDeliverables: ["Homepage mockup v2", "Mobile wireframes"],
			pendingDecisions: 3,
			portalUrl: "https://example.com/portal/projects/proj_123",
		},
		{
			name: "API Integration",
			status: "in_progress",
			recentDeliverables: ["Auth module"],
			pendingDecisions: 0,
			portalUrl: "https://example.com/portal/projects/proj_456",
		},
	],
	portalBaseUrl: "https://example.com/portal",
} as ClientDigestEmailProps;

export default ClientDigestEmail;
