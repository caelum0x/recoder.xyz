import * as React from "react"
import { classNames } from '~/utils/classNames';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={classNames(
          "flex min-h-[80px] w-full rounded-md border border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 px-3 py-2 text-sm text-recoder-elements-textPrimary ring-offset-recoder-elements-background-depth-1 placeholder:text-recoder-elements-textTertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
