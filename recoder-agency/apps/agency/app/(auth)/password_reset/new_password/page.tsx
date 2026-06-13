import { AuthContainer, AuthContainerHeader } from "../../components";
import { Form } from "./form";

export default function NewPasswordPage() {
	return (
		<AuthContainer title="Set New Password">
			<AuthContainerHeader
				title="Set up security"
				description="Your new password must be different to previously used passwords."
			/>

			<div className="auth-form-section">
				<Form />
			</div>
		</AuthContainer>
	);
}
