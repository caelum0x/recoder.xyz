import clsx from "clsx/lite";

type HeadingAs = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";

interface PageHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
	as?: HeadingAs;
	glow?: boolean;
	glowColor?: string; // CSS color string used for text-shadow glow
}

export function PageHeading({
	as = "h1",
	glow = false,
	glowColor = "#0087f6",
	className,
	style,
	children,
	...props
}: PageHeadingProps) {
	const Comp = as as React.ElementType;
	const glowStyle = glow
		? ({
				textShadow: `0 0 20px ${glowColor}, 0 0 40px ${glowColor}, 0 0 60px ${glowColor}`,
			} as React.CSSProperties)
		: undefined;

	return (
		<Comp
			className={clsx(
				// default visual consistent with /apps heading
				"text-[30px] font-sans font-medium text-[hsl(192,73%,84%)]",
				className,
			)}
			style={{ ...glowStyle, ...style }}
			{...props}
		>
			{children}
		</Comp>
	);
}
