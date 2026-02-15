"use client";

import { TriangleAlertIcon } from "lucide-react";
import { type FC, useActionState, useCallback, useRef } from "react";
import { ClickableText } from "@/components/ui/clickable-text";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { ActionPrompt } from "../../components/action-prompt";
import { AuthButton } from "../../components/auth-button";
import { useSignupContext } from "../context";
import { resendOtp, verifyEmail } from "./verify-email";

export const VerifyEmailForm: FC = () => {
	const { state } = useSignupContext();
	const [verifyState, verifyAction, isVerifyPending] = useActionState(
		verifyEmail,
		null,
	);
	const [resendState, resendAction, isResendPending] = useActionState(
		resendOtp,
		null,
	);
	const formRef = useRef<HTMLFormElement>(null);
	const handleComplete = useCallback(() => {
		formRef.current?.requestSubmit();
	}, []);
	const handleResend: React.MouseEventHandler<HTMLButtonElement> = (e) => {
		e.preventDefault();
		const formData = new FormData(formRef.current || undefined);
		resendAction(formData);
	};

	return (
		<div className="grid gap-[8px]">
			{verifyState && (
				<div className="text-error-900 bg-error-900/12 border border-error-900/40 rounded-[12px] p-3 text-[12px] font-geist">
					<div className="flex items-center gap-2">
						<TriangleAlertIcon className="w-4 h-4" />
						<span className="font-bold">Authentication Error</span>
					</div>
					<div className="mt-1">
						{verifyState.message || "An error occurred. Please try again."}
					</div>
				</div>
			)}
			{resendState && resendState.code !== "success" && (
				<div className="text-error-900 bg-error-900/12 border border-error-900/40 rounded-[12px] p-3 text-[12px] font-geist">
					<div className="flex items-center gap-2">
						<TriangleAlertIcon className="w-4 h-4" />
						<span className="font-bold">Authentication Error</span>
					</div>
					<div className="mt-1">
						{resendState.message || "An error occurred. Please try again."}
					</div>
				</div>
			)}
			{resendState && resendState.code === "success" && (
				<div className="text-green bg-green/12 border border-green/40 rounded-[12px] p-3 text-[12px] font-geist">
					<div className="flex items-center gap-2">
						<TriangleAlertIcon className="w-4 h-4" />
						<span className="font-bold">Success</span>
					</div>
					<div className="mt-1">
						{resendState.message || "Resend completed!"}
					</div>
				</div>
			)}
			<form className="flex justify-center" action={verifyAction} ref={formRef}>
				<div className="grid gap-4">
					<InputOTP
						maxLength={6}
						data-1p-ignore
						name="token"
						onComplete={handleComplete}
						className="notranslate" // prevent Google Chrome translation to avoid DOM error
					>
						<InputOTPGroup>
							<InputOTPSlot index={0} />
							<InputOTPSlot index={1} />
							<InputOTPSlot index={2} />
						</InputOTPGroup>
						<InputOTPSeparator />
						<InputOTPGroup>
							<InputOTPSlot index={3} />
							<InputOTPSlot index={4} />
							<InputOTPSlot index={5} />
						</InputOTPGroup>
					</InputOTP>
					<input type="hidden" name="verificationEmail" value={state.email} />

					<div className="flex justify-center">
						<ActionPrompt
							prompt="Didn't receive a code?"
							action={
								<ClickableText
									onClick={handleResend}
									disabled={isResendPending}
								>
									Click to resend
								</ClickableText>
							}
						/>
					</div>
					<AuthButton type="submit" disabled={isVerifyPending}>
						Verify
					</AuthButton>
				</div>
			</form>
		</div>
	);
};
