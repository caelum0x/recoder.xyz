import type { FC, ReactNode } from "react";

type ActionPromptProps = {
	leftIcon?: ReactNode;
	prompt?: string;
	action: ReactNode;
};
export const ActionPrompt: FC<ActionPromptProps> = ({
	prompt,
	action,
	leftIcon,
}) => (
	<div className="text-[14px] text-text/60 flex items-center justify-center gap-2">
		{leftIcon && leftIcon}
		{prompt && <p>{prompt}</p>}
		{action}
	</div>
);
