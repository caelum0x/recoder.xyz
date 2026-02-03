import * as React from "react"
import { classNames } from '~/utils/classNames';

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={classNames(
          "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-900 dark:text-bolt-elements-textPrimary",
          className
        )}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
