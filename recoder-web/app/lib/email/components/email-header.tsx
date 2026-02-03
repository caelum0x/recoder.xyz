// @ts-nocheck
import { Heading, Section } from '@react-email/components';
import * as React from 'react';

export interface EmailHeaderProps {
  /** Optional custom logo URL */
  logoUrl?: string;
}

/**
 * Consistent header component for all email templates
 */
export const EmailHeader: React.FC<EmailHeaderProps> = ({ logoUrl }) => {
  return (
    <Section className="bg-brand p-5 text-center rounded-t-lg">
      {logoUrl ? (
        <img src={logoUrl} alt="Recoder" className="h-8 mx-auto" />
      ) : (
        <Heading as="h1" className="text-white m-0 text-2xl font-bold">
          Recoder
        </Heading>
      )}
    </Section>
  );
};
