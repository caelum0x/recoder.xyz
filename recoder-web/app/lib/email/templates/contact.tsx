// @ts-nocheck
import { Heading, Section, Text } from '@react-email/components';
import type * as React from 'react';
import { ContentSection, EmailContainer, InfoBox } from '../components';

interface ContactTemplateProps {
  name: string;
  email: string;
  message: string;
}

/**
 * Contact form submission email template
 */
export const ContactTemplate: React.FC<ContactTemplateProps> = ({ name, email, message }) => {
  return (
    <EmailContainer
      title="Recoder Contact Form Submission"
      previewText={`${name} sent a message via the contact form`}
    >
      <ContentSection>
        <Heading as="h2" className="mt-0 text-gray-800 text-xl font-semibold">
          New Contact Form Submission
        </Heading>

        <Text className="mb-2 text-gray-600 leading-relaxed">
          You have received a new message from the website contact form:
        </Text>

        <InfoBox title="Contact Information" variant="info">
          <Text className="text-gray-600 m-0 leading-relaxed">
            <strong>Name:</strong> {name}
          </Text>
          <Text className="text-gray-600 m-0 leading-relaxed">
            <strong>Email:</strong> {email}
          </Text>
        </InfoBox>

        <Section className="bg-gray-50 p-4 rounded border border-gray-200 mb-6">
          <Heading as="h3" className="mt-0 mb-2 text-gray-800 text-base font-medium">
            Message Content:
          </Heading>
          <Text className="text-gray-600 m-0 whitespace-pre-line leading-relaxed">{message}</Text>
        </Section>

        <Text className="text-gray-600 mb-0 text-sm leading-relaxed">
          Please respond to this message promptly to provide excellent customer service.
        </Text>
      </ContentSection>
    </EmailContainer>
  );
};

export default ContactTemplate;
