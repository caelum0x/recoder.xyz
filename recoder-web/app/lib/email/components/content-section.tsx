// @ts-nocheck
import { Section } from '@react-email/components';
import type * as React from 'react';

export interface ContentSectionProps {
  /** Section content */
  children: React.ReactNode;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Content section for email templates with consistent styling
 * Uses inline styles for better email client compatibility
 */
export const ContentSection: React.FC<ContentSectionProps> = ({ children, className = '' }) => {
  return (
    <Section
      className={className}
      style={{
        padding: '28px',
      }}
    >
      {children}
    </Section>
  );
};
