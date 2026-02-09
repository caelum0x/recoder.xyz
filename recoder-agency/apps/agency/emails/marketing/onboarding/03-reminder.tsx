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
} from "../../components";

interface ReminderEmailProps {
	userName?: string;
	returnUrl?: string;
	examplesGalleryUrl?: string;
	releaseNotesUrl?: string;
}

export const ReminderEmail = ({
	userName = "there",
	returnUrl = "https://agency.recoder.xyz",
	examplesGalleryUrl = "https://recoder.xyz",
	releaseNotesUrl:
		_releaseNotesUrl = "https://agency.recoder.xyz/docs/en/releases/release-notes",
}: ReminderEmailProps) => {
	return (
		<Html>
			<Head>
				<EmailFonts />
			</Head>
			<Preview>Your workspace is waiting 🌙</Preview>
			<Body style={main}>
				<Container style={container}>
					<EmailHeader
						heading="Your workspace is waiting."
						subheading="Create your first agent and start building."
					/>
					<Section style={topBorderSection}>
						<Hr style={topBorder} />
					</Section>
					<Section style={section}>
						<Text style={text}>
							Hi {userName},<br />
							<br />
							You started setting up Recoder Agency but haven&apos;t created
							your first agent yet.
							<br />
							<br />
							Your workspace is ready — it only takes a few minutes to build
							your first agent. Try Stage to test agents instantly, or create
							your first workspace to start building visually.
							<br />
							<br />
							Pick up right where you left off and start creating.
						</Text>
						<Button href={returnUrl} style={button}>
							Create your first agent
						</Button>
						<Text style={text}>
							Need help getting started? Check out our{" "}
							<Link href={examplesGalleryUrl} style={link}>
								examples gallery
							</Link>{" "}
							or reach out anytime at{" "}
							<Link href="mailto:support@recoder.xyz" style={link}>
								support@recoder.xyz
							</Link>
							.
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

ReminderEmail.PreviewProps = {
	userName: "John",
	returnUrl: "https://agency.recoder.xyz",
	examplesGalleryUrl: "https://recoder.xyz",
	releaseNotesUrl: "https://agency.recoder.xyz/docs/en/releases/release-notes",
} as ReminderEmailProps;

export default ReminderEmail;
