import {
	Body,
	Button,
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
	button,
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

interface ClientInvitationEmailProps {
	agencyName?: string;
	clientName?: string;
	joinUrl?: string;
}

const AGENCY_NAME_PLACEHOLDER = "{{ agency_name }}";
const CLIENT_NAME_PLACEHOLDER = "{{ client_name }}";
const JOIN_URL_PLACEHOLDER = "{{ join_url }}";

export const ClientInvitationEmail = ({
	agencyName,
	clientName,
	joinUrl,
}: ClientInvitationEmailProps) => {
	const displayAgencyName = agencyName ?? AGENCY_NAME_PLACEHOLDER;
	const displayClientName = clientName ?? CLIENT_NAME_PLACEHOLDER;
	const displayJoinUrl = joinUrl ?? JOIN_URL_PLACEHOLDER;

	return (
		<Html>
			<Head>
				<EmailFonts />
			</Head>
			<Preview>
				You&apos;ve been invited to the {displayAgencyName} client portal
			</Preview>
			<Body style={main}>
				<Container style={container}>
					<EmailHeader
						heading="You&apos;ve been invited to a client portal."
						subheading="View your projects, review deliverables, and submit briefs."
					/>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
					<Section style={section}>
						<Heading style={h1}>Client Portal Invitation</Heading>
						<Text style={text}>
							Hi <strong style={highlightText}>{displayClientName}</strong>,
						</Text>
						<Text style={text}>
							You&apos;ve been invited to access the{" "}
							<strong style={highlightText}>{displayAgencyName}</strong> client
							portal. From the portal, you can track your project progress,
							review deliverables, and submit new briefs.
						</Text>
						<Text style={text}>
							Click the button below to accept the invitation and set up your
							account.
						</Text>
						<Button href={displayJoinUrl} style={button}>
							Accept Invitation
						</Button>
						<Text style={text}>
							This invitation expires in 24 hours. If you didn&apos;t expect
							this invitation, you can safely ignore this email.
						</Text>
						<Text style={signatureText}>
							&mdash;
							<br />
							The {displayAgencyName} Team
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

ClientInvitationEmail.PreviewProps = {
	agencyName: "Acme Agency",
	clientName: "Jane Doe",
	joinUrl: "https://example.com/join/client/abc-123",
} as ClientInvitationEmailProps;

export default ClientInvitationEmail;
