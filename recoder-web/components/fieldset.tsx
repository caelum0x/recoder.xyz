import { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type FieldsetProps = ComponentProps<"fieldset">;

export default function Fieldset({
  children,
  ...rest
}: FieldsetProps) {
  const { pending } = useFormStatus();

  return (
    <fieldset {...(rest as any)} disabled={pending}>
      {children}
    </fieldset>
  );
}
