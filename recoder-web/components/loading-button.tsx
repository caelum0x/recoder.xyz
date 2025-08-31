import Spinner from "@/components/spinner";
import { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type ButtonProps = ComponentProps<"button">;

export default function LoadingButton({
  children,
  ...rest
}: ButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button {...(rest as any)} disabled={pending} className={`web-button ${rest.className || ''}`}>
      <Spinner loading={pending}>{children}</Spinner>
    </button>
  );
}
