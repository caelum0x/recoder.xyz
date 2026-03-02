import type { FC, ImgHTMLAttributes } from "react";

type RecoderAgencyLogoProps = ImgHTMLAttributes<HTMLImageElement>;

export const RecoderAgencyLogo: FC<RecoderAgencyLogoProps> = ({
	className,
	...props
}) => {
	return (
		<img
			{...props}
			src="/logo.png"
			alt="Recoder Agency Logo"
			className={className}
		/>
	);
};

// Backward compatibility alias for legacy imports.
export const GiselleLogo = RecoderAgencyLogo;
