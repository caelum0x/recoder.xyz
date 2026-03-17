import Image from "next/image";
import type { FC } from "react";

interface RecoderLogoProps {
	className?: string;
	size?: number;
}

export const RecoderLogo: FC<RecoderLogoProps> = ({ className, size = 24 }) => {
	return (
		<div className={`flex items-center ${className ?? ""}`}>
			<Image
				src="/logo.png"
				alt="Recoder"
				width={size}
				height={size}
				className="rounded"
			/>
		</div>
	);
};
