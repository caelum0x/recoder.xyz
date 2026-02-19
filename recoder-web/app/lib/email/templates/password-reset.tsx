// @ts-nocheck
import { Heading, Section, Text } from '@react-email/components';
import type * as React from 'react';
import { Button, ContentSection, EmailContainer, InfoBox } from '../components';

interface PasswordResetTemplateProps {
  resetLink: string;
  expiresIn?: string;
}

/**
 * Password reset email template
 */
export const PasswordResetTemplate: React.FC<PasswordResetTemplateProps> = ({
  resetLink,
  expiresIn = '1 hour',
}) => {
  return (
    <EmailContainer
      title="Reset Your Recoder Password"
      previewText="Reset your Recoder account password"
    >
      <ContentSection>
        <Heading as="h2" className="mt-0 text-gray-800 text-xl font-semibold">
          Reset Your Password
        </Heading>

        <Text className="mb-6 text-gray-600 leading-relaxed">
          We received a request to reset the password for your Recoder account. Click the button
          below to choose a new password:
        </Text>

        {/* Call to Action Button */}
        <Section className="text-center mb-7">
          <Button href={resetLink} variant="primary">
            Reset Password
          </Button>
        </Section>

        {/* Security Information */}
        <InfoBox title="Important Security Information" variant="warning">
          <Text className="text-gray-600 m-0 leading-relaxed">
            This link will expire in <strong>{expiresIn}</strong>. If you didn't request a password
            reset, please ignore this email. Your password will remain unchanged.
          </Text>
        </InfoBox>

        {/* Instructions */}
        <Text className="text-gray-600 mb-2 leading-relaxed">
          If the button above doesn't work, copy and paste this link into your browser:
        </Text>
        <Text
          className="text-gray-500 mb-6 text-sm leading-relaxed"
          style={{ wordBreak: 'break-all' }}
        >
          {resetLink}
        </Text>

        {/* Help Section */}
        <Section className="border-t border-gray-200 pt-5 mt-2">
          <Text className="text-sm text-gray-500 mb-0 leading-relaxed">
            If you didn't request this email, someone may have entered your email address by
            mistake. You can safely ignore this email.
          </Text>
        </Section>
      </ContentSection>
    </EmailContainer>
  );
};

export default PasswordResetTemplate;
