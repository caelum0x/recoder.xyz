import { ComponentProps } from "react";

type SVGProps = ComponentProps<"svg">;


export default function ChevronLeftIcon(props: SVGProps) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...(props as any)}
    >
      <path
        d="M8.75 10.5L5.25 7l3.5-3.5"
        stroke="currentColor"
        strokeWidth={0.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
