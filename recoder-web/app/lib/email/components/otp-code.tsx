// @ts-nocheck
import { Section, Text } from '@react-email/components';
import * as React from 'react';

export interface OtpCodeProps {
  /** The OTP code to display */
  code: string;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Component for displaying OTP codes in emails with consistent styling
 */
export const OtpCode: React.FC<OtpCodeProps> = ({ code, className = '' }) => {
  return (
    <Section
      className={className}
      style={{
        backgroundColor: '#eef2ff', // Indigo-50 to match Recoder brand
        borderLeft: '4px solid #6366f1', // Indigo-500
        padding: '16px',
        marginBottom: '24px',
        textAlign: 'center',
        borderRadius: '6px',
      }}
    >
      <Text
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          letterSpacing: '5px',
          margin: '0',
          color: '#1f2937', // Gray-800
          fontFamily: 'Monaco, Consolas, "Courier New", monospace',
        }}
      >
        {code}
      </Text>
    </Section>
  );
};
