import clsx from "clsx";
import { forwardRef } from "react";

type ButtonProps = {
	variant?: "primary" | "outline" | "ghost";
	size?: "sm" | "md" | "lg";
	loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	function Button(
		{
			variant = "primary",
			size = "md",
			className,
			children,
			loading,
			...props
		},
		ref,
	) {
		return (
			<button
				className={clsx(
					"rounded-[8px] font-accent inline-flex items-center justify-center",
					{
						"bg-primary-900 text-inverse hover:bg-primary-800":
							variant === "primary",
						"bg-transparent text-inverse border border-border/20 hover:bg-surface-hover":
							variant === "outline",
						"bg-transparent text-inverse hover:bg-surface-hover":
							variant === "ghost",
					},
					{
						"text-[12px] font-bold px-[12px] py-[4px]": size === "sm",
						"text-[14px] font-bold px-[16px] py-[8px]": size === "md",
						"text-[16px] font-bold px-[20px] py-[10px]": size === "lg",
					},
					{
						"opacity-70 cursor-wait": loading,
					},
					className,
				)}
				ref={ref}
				data-loading={loading}
				disabled={loading}
				{...props}
			>
				{children}
			</button>
		);
	},
);
