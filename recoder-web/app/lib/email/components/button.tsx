// @ts-nocheck
import { Link } from '@react-email/components';
import type * as React from 'react';

export interface ButtonProps {
  /** URL the button links to */
  href: string;
  /** Button text */
  children: React.ReactNode;
  /** CSS class variants */
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive';
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Button component for emails with Outlook-compatible styling
 * Uses inline styles and table-based layout for maximum compatibility
 */
export const Button: React.FC<ButtonProps> = ({
  href,
  children,
  variant = 'primary',
  className = '',
}) => {
  // Define variant styles with RGB colors for better email client support
  const variantStyles = {
    primary: {
      backgroundColor: '#6366f1', // Indigo-500 (Recoder brand)
      color: '#ffffff',
      borderColor: '#6366f1',
    },
    secondary: {
      backgroundColor: '#f3f4f6', // Gray-100
      color: '#1f2937', // Gray-800
      borderColor: '#e5e7eb', // Gray-200
    },
    outline: {
      backgroundColor: '#ffffff',
      color: '#6366f1', // Recoder brand color
      borderColor: '#6366f1',
    },
    destructive: {
      backgroundColor: '#ef4444', // Red-500
      color: '#ffffff',
      borderColor: '#ef4444',
    },
  };

  const styles = variantStyles[variant];

  return (
    <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: '0 auto' }}>
      <tr>
        <td
          style={{
            backgroundColor: styles.backgroundColor,
            borderRadius: '6px',
            border: `2px solid ${styles.borderColor}`,
          }}
        >
          <Link
            href={href}
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              fontSize: '16px',
              fontWeight: '600',
              color: styles.color,
              textDecoration: 'none',
              textAlign: 'center' as const,
              lineHeight: '1.5',
            }}
            className={className}
          >
            {children}
          </Link>
        </td>
      </tr>
    </table>
  );
};
