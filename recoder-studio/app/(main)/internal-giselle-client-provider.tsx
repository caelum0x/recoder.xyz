"use client";

import { GiselleClientProvider as RecoderStudioClientProvider } from "@recoder/react";
import { useMemo } from "react";
import { createInternalRecoderStudioClient } from "@/lib/internal-api/create-recoder-studio-client";

export function InternalRecoderStudioClientProvider({
	children,
}: React.PropsWithChildren) {
	const client = useMemo(() => {
		return createInternalRecoderStudioClient();
	}, []);

	return (
		<RecoderStudioClientProvider value={client}>
			{children}
		</RecoderStudioClientProvider>
	);
}

// Backward compatibility alias for legacy imports.
export const InternalGiselleClientProvider = InternalRecoderStudioClientProvider;
