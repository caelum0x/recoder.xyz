import { and, asc, eq } from "drizzle-orm";
import { db, serviceCatalog } from "@/db";

export async function getActiveServices(teamDbId: number) {
	try {
		return await db
			.select()
			.from(serviceCatalog)
			.where(
				and(
					eq(serviceCatalog.teamDbId, teamDbId),
					eq(serviceCatalog.status, "active"),
				),
			)
			.orderBy(asc(serviceCatalog.sortOrder), asc(serviceCatalog.name));
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("service_catalog")
		) {
			return [];
		}
		throw error;
	}
}

export async function getServiceById(teamDbId: number, serviceId: string) {
	try {
		return await db.query.serviceCatalog.findFirst({
			where: and(
				eq(serviceCatalog.id, serviceId),
				eq(serviceCatalog.teamDbId, teamDbId),
			),
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("service_catalog")
		) {
			return undefined;
		}
		throw error;
	}
}

export async function getAllServices(teamDbId: number) {
	try {
		return await db
			.select()
			.from(serviceCatalog)
			.where(eq(serviceCatalog.teamDbId, teamDbId))
			.orderBy(asc(serviceCatalog.sortOrder), asc(serviceCatalog.name));
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("service_catalog")
		) {
			return [];
		}
		throw error;
	}
}
