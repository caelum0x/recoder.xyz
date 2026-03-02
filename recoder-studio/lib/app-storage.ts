import {
	storageDeleteObjects,
	storagePublicUrl,
	storageUploadObject,
} from "@/lib/storage/r2";

const storageBucketName = process.env.APP_STORAGE_BUCKET ?? "public-assets";

export function appStorage() {
	return {
		async upload(
			path: string,
			data: Buffer,
			options?: { contentType?: string; upsert?: boolean },
		) {
			try {
				const uploaded = await storageUploadObject({
					bucket: storageBucketName,
					key: path,
					body: data,
					contentType: options?.contentType,
					upsert: options?.upsert,
				});
				return { data: { path: uploaded.key }, error: null };
			} catch (error) {
				return { data: null, error };
			}
		},
		getPublicUrl(path: string) {
			return {
				data: {
					publicUrl: storagePublicUrl(storageBucketName, path),
				},
			};
		},
		async remove(paths: string[]) {
			try {
				await storageDeleteObjects(storageBucketName, paths);
				return { data: null, error: null };
			} catch (error) {
				return { data: null, error };
			}
		},
	};
}
