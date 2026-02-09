"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { InviteClientDialog } from "./invite-client-dialog";

interface InviteClientButtonProps {
	clientId: string;
	clientName: string;
	clientEmail: string;
}

export function InviteClientButton({
	clientId,
	clientName,
	clientEmail,
}: InviteClientButtonProps) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [showDialog, setShowDialog] = useState(false);

	useEffect(() => {
		if (searchParams.get("invite") === "1") {
			setShowDialog(true);
		}
	}, [searchParams]);

	const handleClose = () => {
		setShowDialog(false);
		router.replace(`/clients/${clientId}`);
	};

	const handleOpen = () => {
		router.push(`/clients/${clientId}?invite=1`);
		setShowDialog(true);
	};

	return (
		<>
			<button
				type="button"
				onClick={handleOpen}
				className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
			>
				Invite to Portal
			</button>

			{showDialog && (
				<InviteClientDialog
					clientId={clientId}
					clientName={clientName}
					clientEmail={clientEmail}
					onClose={handleClose}
				/>
			)}
		</>
	);
}
