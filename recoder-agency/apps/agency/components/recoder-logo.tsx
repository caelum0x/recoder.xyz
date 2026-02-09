import Image from "next/image";
import type { FC } from "react";

interface RecoderLogoProps {
	className?: string;
	size?: number;
}

export const RecoderLogo: FC<RecoderLogoProps> = ({ className, size = 24 }) => {
	return (
		<div className={`flex items-center gap-2 ${className ?? ""}`}>
			<Image
				src="/recoder-logo.png"
				alt="Recoder Agency"
				width={size}
				height={size}
				className="rounded"
			/>
			<span
				className="font-bold text-inherit leading-none"
				style={{ fontSize: size * 0.7 }}
			>
				recoder
			</span>
		</div>
	);
};
