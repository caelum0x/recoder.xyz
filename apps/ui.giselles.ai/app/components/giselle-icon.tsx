import type { ImgHTMLAttributes } from "react";

export function RecoderIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
	return (
		<img {...props} src="/icon.png" alt="Recoder Icon" className={className} />
	);
}

/** @deprecated Use `RecoderIcon` instead. */
export const GiselleIcon = RecoderIcon;
