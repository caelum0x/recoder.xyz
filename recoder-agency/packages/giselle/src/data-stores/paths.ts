import type { DataStoreId } from "@recoder/protocol";

export function dataStorePath(dataStoreId: DataStoreId) {
	return `data-stores/${dataStoreId}/data-store.json`;
}
