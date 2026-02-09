import Image from "next/image";
import type { ReactNode } from "react";

export default function ClientPortalJoinLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="bg-auth relative">
			<div className="z-10 relative">{children}</div>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 100 100"
				className="absolute inset-0 w-full h-full z-0 blur-[100px] fill-auth-ambient"
			>
				<title>ambient light</title>
				<circle cx="50" cy="50" r="50" />
			</svg>
			<div className="z-0 absolute inset-0 flex justify-center items-center overflow-hidden opacity-5">
				<Image
					src="/recoder-logo.png"
					alt=""
					width={400}
					height={400}
					className="absolute -bottom-[10%]"
				/>
			</div>
		</div>
	);
}
