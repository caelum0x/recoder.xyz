import {
	Body,
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
	code,
	codeContainer,
	container,
	EmailFonts,
	EmailFooter,
	EmailHeader,
	footerText,
	h1,
	link,
	main,
	section,
	signatureText,
	text,
	topBorder,
	topBorderSection,
} from "../components";

interface ConfirmSignUpEmailProps {
	token?: string;
}

const SUPABASE_TOKEN_PLACEHOLDER = "{{ .Token }}";

export const ConfirmSignUpEmail = ({ token }: ConfirmSignUpEmailProps) => {
	const displayToken = token ?? SUPABASE_TOKEN_PLACEHOLDER;
	return (
		<Html>
			<Head>
				<EmailFonts />
			</Head>
			<Preview>Verification code for Recoder Agency</Preview>
			<Body style={main}>
				<Container style={container}>
					<EmailHeader
						heading="Verify your email."
						subheading="Your workspace is almost ready."
					/>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
					<Section style={section}>
						<Text style={{ ...h1, marginBottom: "16px" }}>
							You&apos;re almost in!
						</Text>
						<Text style={text}>Your verification code is:</Text>
						<Section style={codeContainer}>
							<Text style={code}>{displayToken}</Text>
						</Section>
						<Text style={text}>
							Enter it to verify your email and begin your journey with Recoder
							Agency.
						</Text>
						<Text style={footerText}>This code will expire in 1 hour.</Text>
						<Text style={footerText}>
							If you didn&apos;t request this code, you can safely ignore this
							email.
						</Text>
						<Text style={footerText}>
							Need a hand?{" "}
							<Link href="mailto:support@recoder.xyz" style={link}>
								support@recoder.xyz
							</Link>
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

ConfirmSignUpEmail.PreviewProps = {
	token: "123456",
} as ConfirmSignUpEmailProps;

export default ConfirmSignUpEmail;
