import { Container, Img, Link, Section, Text } from "@react-email/components";

import { getEmailAssetUrl } from "../utils/email-assets";

export const EmailFooter = () => {
	const footerLogoSrc = getEmailAssetUrl("letter_footer-logo.png");
	const githubIconSrc = getEmailAssetUrl("github-icon.png");
	const linkedinIconSrc = getEmailAssetUrl("linkedin-icon.png");
	const facebookIconSrc = getEmailAssetUrl("facebook-icon.png");
	const xIconSrc = getEmailAssetUrl("x-icon.png");
	const instagramIconSrc = getEmailAssetUrl("instagram-icon.png");
	const youtubeIconSrc = getEmailAssetUrl("youtube-icon.png");
	return (
		<Container style={footerContainer}>
			<Section style={footerSection}>
				<Img
					src={footerLogoSrc}
					width="100"
					height="39"
					alt="Recoder Agency"
					style={footerLogo}
				/>
				<Text style={footerLinksText}>
					<Link href="https://agency.recoder.xyz" style={footerLink}>
						Product
					</Link>
					{" / "}
					<Link href="https://recoder.xyz/blog" style={footerLink}>
						Blog
					</Link>
					{" / "}
					<Link href="https://agency.recoder.xyz/docs" style={footerLink}>
						Documentation
					</Link>
				</Text>
				<Section style={socialIconsSection}>
					<Link
						href="https://github.com/your-org/recoder-agency"
						style={socialIconLink}
					>
						<Img
							src={githubIconSrc}
							width="20"
							height="20"
							alt="GitHub"
							style={socialIcon}
						/>
					</Link>
				</Section>
				<Text style={footerCopyright}>
					© {new Date().getFullYear()} Recoder Agency
				</Text>
				<Text style={footerExplanation}>
					You received this email because you signed up for{" "}
					<Link href="https://recoder.xyz" style={footerLink}>
						Recoder Agency
					</Link>
					—a platform for AI-powered project delivery.
				</Text>
			</Section>
		</Container>
	);
};

const footerContainer = {
	backgroundColor: "transparent",
	margin: "0 auto",
	padding: "0",
	maxWidth: "600px",
};

const footerSection = {
	padding: "32px 48px",
	textAlign: "center" as const,
};

const footerLogo = {
	margin: "0 auto 16px",
	display: "block",
	maxWidth: "100px",
	opacity: 0.3,
};

const footerLinksText = {
	color: "rgba(247, 249, 253, 0.6)",
	fontSize: "12px",
	lineHeight: "18px",
	marginBottom: "16px",
	textAlign: "center" as const,
	fontFamily:
		'"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
	letterSpacing: "0.5px",
};

const socialIconsSection = {
	marginBottom: "16px",
	textAlign: "center" as const,
};

const socialIconLink = {
	display: "inline-block",
	margin: "0 8px",
	textDecoration: "none",
};

const socialIcon = {
	display: "block",
	opacity: 0.6,
};

const footerCopyright = {
	color: "rgba(247, 249, 253, 0.6)",
	fontSize: "12px",
	lineHeight: "18px",
	margin: "0 0 8px",
	fontFamily:
		'"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const footerExplanation = {
	color: "rgba(247, 249, 253, 0.6)",
	fontSize: "12px",
	lineHeight: "18px",
	margin: "0",
	fontFamily:
		'"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const footerLink = {
	color: "#b8e8f4",
	textDecoration: "none",
	fontSize: "12px",
	fontFamily:
		'"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};
