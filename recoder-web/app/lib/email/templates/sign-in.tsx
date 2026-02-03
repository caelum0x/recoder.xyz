// @ts-nocheck
import { Heading, Section, Text } from '@react-email/components';
import type * as React from 'react';
import { ContentSection, EmailContainer, OtpCode } from '../components';

interface SignInTemplateProps {
  otp: string;
}

/**
 * Sign-in verification email with OTP code
 */
export const SignInTemplate: React.FC<SignInTemplateProps> = ({ otp }) => {
  return (
    <EmailContainer title="Recoder Sign-in Verification" previewText={`Recoder verification code: ${otp}`}>
      <ContentSection>
        <Heading as="h2" className="mt-0 text-gray-800 text-xl font-semibold">
          Verify Your Sign-in
        </Heading>

        <Text className="mb-6 text-gray-600 leading-relaxed">
          Hello! We received a request to sign in to your Recoder account. Please use the following
          verification code to complete the sign-in process:
        </Text>

        {/* Verification Code Box - Using OtpCode component */}
        <OtpCode code={otp} />

        {/* Instructions and Security Notes */}
        <Text className="text-gray-600 mb-2 leading-relaxed">
          This verification code will expire in <strong>10 minutes</strong>.
        </Text>
        <Text className="text-gray-600 mb-6 leading-relaxed">
          If you didn't attempt to sign in, please ignore this email or contact our support team.
        </Text>

        {/* Security Message */}
        <Section className="border-t border-gray-200 pt-5 mt-2">
          <Text className="text-sm text-gray-500 mb-0 leading-relaxed">
            <strong>Security Tip:</strong> Recoder will never ask for your password or financial
            information via email.
          </Text>
        </Section>
      </ContentSection>
    </EmailContainer>
  );
};

export default SignInTemplate;
