import type { FC, SVGProps } from "react";

export const GiselleLogo: FC<SVGProps<SVGSVGElement>> = (props) => {
	return (
		<svg
			{...props}
			width="180"
			height="40"
			viewBox="0 0 180 40"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Recoder Agency</title>
			<text
				x="0"
				y="30"
				fontFamily="var(--font-dm-sans), system-ui, sans-serif"
				fontSize="28"
				fontWeight="700"
				fill="currentColor"
			>
				recoder
			</text>
		</svg>
	);
};
