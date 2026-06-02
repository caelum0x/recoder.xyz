import { NextResponse } from "next/server";
import { exportClientDeliveryPackage } from "../actions";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ projectId: string }> },
) {
	const { projectId } = await params;
	const deliveryPackage = await exportClientDeliveryPackage(projectId);

	return new NextResponse(JSON.stringify(deliveryPackage, null, 2), {
		status: 200,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Disposition": `attachment; filename=\"${projectId}-delivery-package.json\"`,
		},
	});
}
