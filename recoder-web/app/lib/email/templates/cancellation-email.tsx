// @ts-nocheck
import { Heading, Link, Section, Text } from '@react-email/components';
import type * as React from 'react';
import { Button, ContentSection, EmailContainer, InfoBox } from '../components';

/**
 * Email sent when a user cancels their subscription
 */
export const CancellationEmailTemplate: React.FC = () => {
  return (
    <EmailContainer
      title="Recoder Subscription Cancelled"
      previewText="Your Recoder subscription has been cancelled"
    >
      <ContentSection>
        <Heading
          as="h2"
          style={{
            margin: '0 0 16px 0',
            fontSize: '24px',
            fontWeight: '600',
            color: '#1f2937', // Gray-800
            lineHeight: '1.4',
          }}
        >
          Subscription Cancelled
        </Heading>

        <Text
          style={{
            margin: '0 0 24px 0',
            fontSize: '16px',
            color: '#6b7280', // Gray-500
            lineHeight: '1.6',
          }}
        >
          We're sorry to see you go. Your Recoder subscription has been cancelled and will no longer
          renew automatically.
        </Text>

        {/* Cancellation Details */}
        <InfoBox title="What Happens Next" variant="info">
          <Text
            style={{
              margin: '0 0 8px 0',
              fontSize: '14px',
              color: '#6b7280', // Gray-500
              lineHeight: '1.6',
            }}
          >
            Your premium features will remain available until the end of the current billing cycle.
            After that, your account will automatically switch to the limited free plan.
          </Text>
          <Text
            style={{
              margin: '0',
              fontSize: '14px',
              color: '#6b7280', // Gray-500
              lineHeight: '1.6',
            }}
          >
            You can reactivate your subscription at any time by visiting your account settings.
          </Text>
        </InfoBox>

        {/* Feedback Request */}
        <Text
          style={{
            margin: '0 0 20px 0',
            fontSize: '16px',
            color: '#6b7280', // Gray-500
            lineHeight: '1.6',
          }}
        >
          We'd like to understand your experience with Recoder and how we can improve our service.
          If you have a moment, please let us know why you decided to cancel.
        </Text>

        {/* Call to Action Button */}
        <Section style={{ textAlign: 'center', marginBottom: '28px' }}>
          <Button href="https://recoder.xyz/feedback" variant="primary">
            Share Your Feedback
          </Button>
        </Section>

        {/* Resubscribe Note */}
        <Text
          style={{
            margin: '0 0 8px 0',
            fontSize: '16px',
            color: '#6b7280', // Gray-500
            lineHeight: '1.6',
          }}
        >
          Changed your mind?{' '}
          <Link
            href="https://recoder.xyz/pricing"
            style={{
              color: '#6366f1', // Recoder brand color
              textDecoration: 'none',
            }}
          >
            Reactivate your subscription at any time
          </Link>
          .
        </Text>
      </ContentSection>
    </EmailContainer>
  );
};

export default CancellationEmailTemplate;
