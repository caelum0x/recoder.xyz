import {
	Body,
	Button,
	Container,
	Head,
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
	link,
	main,
	section,
	signatureText,
	text,
	topBorder,
	topBorderSection,
} from "../components";

interface ResetPasswordEmailProps {
	siteUrl?: string;
	tokenHash?: string;
}

const SUPABASE_SITE_URL_PLACEHOLDER = "{{ .SiteURL }}";
const SUPABASE_TOKEN_HASH_PLACEHOLDER = "{{ .TokenHash }}";

export const ResetPasswordEmail = ({
	siteUrl,
	tokenHash,
}: ResetPasswordEmailProps) => {
	const displaySiteUrl = siteUrl ?? SUPABASE_SITE_URL_PLACEHOLDER;
	const displayTokenHash = tokenHash ?? SUPABASE_TOKEN_HASH_PLACEHOLDER;
	const resetUrl = `${displaySiteUrl}/password_reset/confirm?token_hash=${displayTokenHash}&type=recovery&next=/password_reset/new_password`;

	return (
		<Html>
			<Head>
				<EmailFonts />
			</Head>
			<Preview>Reset your Recoder password</Preview>
			<Body style={main}>
				<Container style={container}>
					<EmailHeader
						heading="Reset your Recoder password."
						subheading="Your journey continues securely."
					/>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
					<Section style={section}>
						<Text style={text}>
							We received a request to reset your Recoder account password.
						</Text>
						<Text style={text}>
							Click the button below to complete your password reset. The link
							will expire in 1 hour.
						</Text>
						<Button href={resetUrl} style={button}>
							Reset Password
						</Button>
						<Text style={text}>
							If you didn&apos;t ask to reset your password, please ignore this
							message.
						</Text>
						<Text style={signatureText}>
							—<br />
							The Recoder Team
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

ResetPasswordEmail.PreviewProps = {
	siteUrl: "https://agency.recoder.xyz",
	tokenHash: "example-token-hash",
} as ResetPasswordEmailProps;

export default ResetPasswordEmail;
