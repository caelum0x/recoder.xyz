import Link from "next/link";
import type { FC } from "react";

export const LegalConsent: FC = () => (
	<p className="font-geist text-[12px] text-text/60 text-center mt-4">
		By continuing, you agree to our{" "}
		<Link
			href="https://giselles.ai/legal/terms"
			className="font-[700] underline text-blue-light hover:text-blue-pale"
		>
			Terms of Service
		</Link>{" "}
		and{" "}
		<Link
			href="https://giselles.ai/legal/privacy"
			className="font-[700] underline font-geist text-blue-light hover:text-blue-pale"
		>
			Privacy Policy
		</Link>
		.
	</p>
);
