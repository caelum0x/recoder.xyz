import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  }[size];

  return (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-primary ${sizeClass} ${className}`} />
  );
}

export default LoadingSpinner;