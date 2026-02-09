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

interface ClientPortalInvitationEmailProps {
	clientName?: string;
	agencyName?: string;
	inviterEmail?: string;
	portalUrl?: string;
}

const CLIENT_NAME_PLACEHOLDER = "{{ client_name }}";
const AGENCY_NAME_PLACEHOLDER = "{{ agency_name }}";
const INVITER_EMAIL_PLACEHOLDER = "{{ inviter_email }}";
const PORTAL_URL_PLACEHOLDER = "{{ portal_url }}";

export const ClientPortalInvitationEmail = ({
	clientName,
	agencyName,
	inviterEmail,
	portalUrl,
}: ClientPortalInvitationEmailProps) => {
	const displayClientName = clientName ?? CLIENT_NAME_PLACEHOLDER;
	const displayAgencyName = agencyName ?? AGENCY_NAME_PLACEHOLDER;
	const displayInviterEmail = inviterEmail ?? INVITER_EMAIL_PLACEHOLDER;
	const displayPortalUrl = portalUrl ?? PORTAL_URL_PLACEHOLDER;

	return (
		<Html>
			<Head>
				<EmailFonts />
			</Head>
			<Preview>
				You've been invited to access your client portal for {displayAgencyName}
			</Preview>
			<Body style={main}>
				<Container style={container}>
					<EmailHeader
						heading="Welcome to Your Client Portal"
						subheading="Access your projects, briefs, and deliverables in one place."
					/>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
					<Section style={section}>
						<Heading style={h1}>Hello, {displayClientName}!</Heading>
						<Text style={text}>
							<strong style={highlightText}>{displayAgencyName}</strong> has
							invited you to access your dedicated client portal. You can now
							view project updates, submit briefs, and review deliverables.
						</Text>
						<Text style={text}>
							This invitation was sent by{" "}
							<strong style={highlightText}>{displayInviterEmail}</strong>.
						</Text>
						<Button href={displayPortalUrl} style={button}>
							Access Your Portal
						</Button>
						<Text style={text}>
							If you didn&apos;t expect this invitation or have any questions,
							please contact the agency directly.
						</Text>
						<Text style={signatureText}>
							—<br />
							The Recoder Agency Team
							<br />
							<Link href="https://recoder.xyz" style={link}>
								https://recoder.xyz
							</Link>
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

export default ClientPortalInvitationEmail;
