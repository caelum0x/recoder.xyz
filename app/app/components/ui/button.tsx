interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline'
  children: React.ReactNode
}

export function Button({ variant = 'default', children, className = '', ...props }: ButtonProps) {
  const baseStyles = 'px-4 py-2 rounded-md font-medium transition-colors'
  const variantStyles = variant === 'outline' 
    ? 'border border-gray-300 bg-transparent hover:bg-gray-50' 
    : 'bg-blue-600 text-white hover:bg-blue-700'
  
  return (
    <button 
      className={`${baseStyles} ${variantStyles} ${className}`} 
      {...props}
    >
      {children}
    </button>
  )
}