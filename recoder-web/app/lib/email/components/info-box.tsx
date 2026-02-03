// @ts-nocheck
import { Heading, Section, Text } from '@react-email/components';
import type * as React from 'react';

export interface InfoBoxProps {
  /** Box title */
  title?: string;
  /** Box content */
  children: React.ReactNode;
  /** Box type/style variant */
  variant?: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Information box component for highlighting important information in emails
 * Uses inline styles for maximum email client compatibility
 */
export const InfoBox: React.FC<InfoBoxProps> = ({ title, children, variant = 'info' }) => {
  // Define variant styles with RGB colors and inline styles
  const variantStyles = {
    info: {
      backgroundColor: '#eef2ff', // Indigo-50 to match Recoder brand
      borderLeft: '4px solid #6366f1', // Indigo-500
      color: '#1f2937', // Gray-800
    },
    success: {
      backgroundColor: '#f0fdf4', // Green-50
      borderLeft: '4px solid #22c55e', // Green-500
      color: '#1f2937', // Gray-800
    },
    warning: {
      backgroundColor: '#fefce8', // Yellow-50
      borderLeft: '4px solid #eab308', // Yellow-500
      color: '#1f2937', // Gray-800
    },
    error: {
      backgroundColor: '#fef2f2', // Red-50
      borderLeft: '4px solid #ef4444', // Red-500
      color: '#1f2937', // Gray-800
    },
  };

  const styles = variantStyles[variant];

  return (
    <Section
      style={{
        ...styles,
        padding: '16px',
        marginBottom: '24px',
        borderRadius: '6px',
      }}
    >
      {title && (
        <Heading
          as="h3"
          style={{
            margin: '0 0 8px 0',
            fontSize: '16px',
            fontWeight: '500',
            color: '#1f2937', // Gray-800
            lineHeight: '1.5',
          }}
        >
          {title}
        </Heading>
      )}
      {typeof children === 'string' ? (
        <Text
          style={{
            margin: '0',
            fontSize: '14px',
            color: '#6b7280', // Gray-500
            lineHeight: '1.6',
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Section>
  );
};
