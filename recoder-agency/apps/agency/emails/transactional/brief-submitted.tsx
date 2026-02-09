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

interface BriefSubmittedEmailProps {
	clientName?: string;
	serviceType?: string;
	description?: string;
	dashboardUrl?: string;
}

export const BriefSubmittedEmail = ({
	clientName,
	serviceType,
	description,
	dashboardUrl,
}: BriefSubmittedEmailProps) => {
	const displayClientName = clientName ?? "{{ client_name }}";
	const displayServiceType = serviceType ?? "{{ service_type }}";
	const displayDescription = description ?? "{{ description }}";
	const displayDashboardUrl = dashboardUrl ?? "{{ dashboard_url }}";

	return (
		<Html>
			<Head>
				<EmailFonts />
			</Head>
			<Preview>New brief submitted by {displayClientName}</Preview>
			<Body style={main}>
				<Container style={container}>
					<EmailHeader
						heading="New brief submitted"
						subheading="A client has submitted a new project brief."
					/>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
					<Section style={section}>
						<Heading style={h1}>New Brief</Heading>
						<Text style={text}>
							<strong style={highlightText}>{displayClientName}</strong> has
							submitted a new brief.
						</Text>
						<Text style={text}>
							<strong>Service:</strong> {displayServiceType}
						</Text>
						<Text style={text}>
							<strong>Description:</strong>
							<br />
							{displayDescription}
						</Text>
						<Text style={text}>
							<Link href={displayDashboardUrl} style={link}>
								View in dashboard
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

BriefSubmittedEmail.PreviewProps = {
	clientName: "Jane Doe",
	serviceType: "Landing Page",
	description: "I need a new landing page for my product launch...",
	dashboardUrl: "https://example.com/dashboard",
} as BriefSubmittedEmailProps;

export default BriefSubmittedEmail;
