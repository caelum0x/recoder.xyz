// @ts-nocheck
import { Link, Section, Text } from '@react-email/components';
import type * as React from 'react';

export interface EmailFooterProps {
  /** Optional extra content to add to the footer */
  extraContent?: React.ReactNode;
}

/**
 * Consistent footer component for all email templates
 */
export const EmailFooter: React.FC<EmailFooterProps> = ({ extraContent }) => {
  const currentYear = new Date().getFullYear();

  return (
    <Section className="bg-muted p-5 text-center border-t border-border rounded-b-lg">
      {extraContent && <div className="mb-4">{extraContent}</div>}
      <Text className="m-0 text-muted-foreground text-sm mb-2">
        &copy; {currentYear} Recoder. All rights reserved.
      </Text>
      <Text className="m-0 text-muted-foreground text-sm">
        <Link
          href="https://recoder.xyz/privacy"
          className="text-brand no-underline mx-2 hover:underline"
        >
          Privacy Policy
        </Link>
        |
        <Link
          href="https://recoder.xyz/terms"
          className="text-brand no-underline mx-2 hover:underline"
        >
          Terms of Service
        </Link>
        |
        <Link
          href="mailto:support@recoder.xyz"
          className="text-brand no-underline mx-2 hover:underline"
        >
          Contact Us
        </Link>
      </Text>
    </Section>
  );
};
