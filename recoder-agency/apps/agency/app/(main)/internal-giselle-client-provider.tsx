"use client";

import { GiselleClientProvider } from "@giselles-ai/react";
import { useMemo } from "react";
import { createInternalGiselleClient } from "@/lib/internal-api/create-giselle-client";

/** @deprecated Wrapper name kept for import compatibility — SDK type is GiselleClientProvider */
export function InternalGiselleClientProvider({
	children,
}: React.PropsWithChildren) {
	const client = useMemo(() => {
		return createInternalGiselleClient();
	}, []);

	return (
		<GiselleClientProvider value={client}>{children}</GiselleClientProvider>
	);
}
