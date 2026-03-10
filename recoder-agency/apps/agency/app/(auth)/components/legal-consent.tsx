import Link from "next/link";
import type { FC } from "react";

export const LegalConsent: FC = () => (
	<p className="font-sans text-[12px] text-text/60 text-center mt-4">
		By continuing, you agree to our{" "}
		<Link
			href="https://recoder.xyz/legal/terms"
			className="font-[700] underline text-blue-light hover:text-blue-pale"
		>
			Terms of Service
		</Link>{" "}
		and{" "}
		<Link
			href="https://recoder.xyz/legal/privacy"
			className="font-[700] underline font-sans text-blue-light hover:text-blue-pale"
		>
			Privacy Policy
		</Link>
		.
	</p>
);
