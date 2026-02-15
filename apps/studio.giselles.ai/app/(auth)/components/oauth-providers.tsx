import { SiGithub, SiGoogle } from "@icons-pack/react-simple-icons";
import type { FC } from "react";
import { authorizeGitHub, authorizeGoogle } from "../actions";
import type { AuthComponentProps } from "../types";
import { ProviderButton } from "./provider-button";

type OauthProvidersProps = AuthComponentProps & {
	labelPrefix: string;
};

export const OAuthProviders: FC<OauthProvidersProps> = ({
	labelPrefix,
	returnUrl,
}) => {
	const items = [
		{
			key: "google",
			icon: <SiGoogle className="h-[20px] w-[20px]" />,
			label: `${labelPrefix} with Google`,
			action: authorizeGoogle,
		},
		{
			key: "github",
			icon: <SiGithub className="h-[20px] w-[20px]" />,
			label: `${labelPrefix} with GitHub`,
			action: authorizeGitHub,
		},
	] as const;

	return (
		<div className="space-y-2">
			{items.map((item) => (
				<ProviderButton
					key={item.key}
					icon={item.icon}
					label={item.label}
					formAction={item.action}
					returnUrl={returnUrl}
				/>
			))}
		</div>
	);
};
