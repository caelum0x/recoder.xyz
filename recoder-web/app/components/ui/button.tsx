import * as React from "react"
import { classNames } from '~/utils/classNames';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, ...props }, ref) => {
    const baseClasses = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
    
    const variantClasses = {
      default: "bg-orange-500 text-white hover:bg-orange-600",
      destructive: "bg-red-600 text-white hover:bg-red-700",
      outline: "border border-recoder-elements-borderColor bg-transparent hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary",
      secondary: "bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2",
      ghost: "hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary",
      link: "text-orange-500 underline-offset-4 hover:underline",
    };
    
    const sizeClasses = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
      icon: "h-10 w-10",
    };

    return (
      <button
        className={classNames(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
