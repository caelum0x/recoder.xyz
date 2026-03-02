import {
	type DataStoreProvider,
	isDataStoreProvider,
} from "@recoder/data-store-registry";
import { createIdGenerator } from "@recoder/utils";
import * as z from "zod/v4";

export const DataStoreId = createIdGenerator("ds");
export type DataStoreId = z.infer<typeof DataStoreId.schema>;

export const DataStore = z.object({
	id: DataStoreId.schema,
	provider: z.custom<DataStoreProvider>((v) => isDataStoreProvider(v)),
	configuration: z.record(z.string(), z.unknown()),
});
export type DataStore = z.infer<typeof DataStore>;
