import type { FC, ImgHTMLAttributes } from "react";

type RecoderStudioLogoProps = ImgHTMLAttributes<HTMLImageElement>;

export const RecoderStudioLogo: FC<RecoderStudioLogoProps> = ({
	className,
	...props
}) => {
	return (
		<img
			{...props}
			src="/logo.png"
			alt="Recoder Studio Logo"
			className={className}
		/>
	);
};

// Backward compatibility alias for legacy imports.
export const GiselleLogo = RecoderStudioLogo;
