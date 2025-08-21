interface AlertProps {
  children: React.ReactNode
  className?: string
}

interface AlertDescriptionProps {
  children: React.ReactNode
  className?: string
}

export function Alert({ children, className = '' }: AlertProps) {
  return (
    <div className={`p-4 rounded-lg border ${className}`}>
      {children}
    </div>
  )
}

export function AlertDescription({ children, className = '' }: AlertDescriptionProps) {
  return (
    <div className={`text-sm ${className}`}>
      {children}
    </div>
  )
}