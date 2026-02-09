import { and, asc, eq } from "drizzle-orm";
import { db, serviceCatalog } from "@/db";

export async function getActiveServices(teamDbId: number) {
	return db
		.select()
		.from(serviceCatalog)
		.where(
			and(
				eq(serviceCatalog.teamDbId, teamDbId),
				eq(serviceCatalog.status, "active"),
			),
		)
		.orderBy(asc(serviceCatalog.sortOrder), asc(serviceCatalog.name));
}

export async function getServiceById(teamDbId: number, serviceId: string) {
	return db.query.serviceCatalog.findFirst({
		where: and(
			eq(serviceCatalog.id, serviceId),
			eq(serviceCatalog.teamDbId, teamDbId),
		),
	});
}

export async function getAllServices(teamDbId: number) {
	return db
		.select()
		.from(serviceCatalog)
		.where(eq(serviceCatalog.teamDbId, teamDbId))
		.orderBy(asc(serviceCatalog.sortOrder), asc(serviceCatalog.name));
}
