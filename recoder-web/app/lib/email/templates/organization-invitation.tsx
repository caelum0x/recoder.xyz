// @ts-nocheck
import { Heading, Section, Text } from '@react-email/components';
import type * as React from 'react';
import { Button, ContentSection, EmailContainer, InfoBox } from '../components';

interface OrganizationInvitationTemplateProps {
  invitedByUsername: string;
  invitedByEmail: string;
  teamName: string;
  inviteLink: string;
}

/**
 * Email sent to invite a user to join a team/organization
 */
export const OrganizationInvitationTemplate: React.FC<OrganizationInvitationTemplateProps> = ({
  invitedByUsername,
  invitedByEmail,
  teamName,
  inviteLink,
}) => {
  return (
    <EmailContainer
      title="Invitation to Join a Recoder Team"
      previewText={`${invitedByUsername} has invited you to join ${teamName}`}
    >
      <ContentSection>
        <Heading as="h2" className="mt-0 text-gray-800 text-xl font-semibold">
          You've Received a Team Invitation
        </Heading>

        <Text className="mb-6 text-gray-600 leading-relaxed">
          {invitedByUsername} ({invitedByEmail}) has invited you to join the "{teamName}" team on
          Recoder.
        </Text>

        {/* Team Invitation Details */}
        <InfoBox title="Invitation Details" variant="info">
          <Text className="text-gray-600 m-0 leading-relaxed">
            <strong>Team Name:</strong> {teamName}
          </Text>
          <Text className="text-gray-600 m-0 leading-relaxed">
            <strong>Invited By:</strong> {invitedByUsername}
          </Text>
          <Text className="text-gray-600 m-0 leading-relaxed">
            <strong>Inviter Email:</strong> {invitedByEmail}
          </Text>
        </InfoBox>

        <Text className="text-gray-600 mb-6 leading-relaxed">
          Once you join the team, you'll have access to shared projects, resources, and
          collaboration features.
        </Text>

        {/* Call to Action Button */}
        <Section className="text-center mb-7">
          <Button href={inviteLink} variant="primary">
            Accept Invitation
          </Button>
        </Section>

        {/* Invitation Note */}
        <Text className="text-gray-600 mb-2 text-sm leading-relaxed">
          This invitation link is valid for 7 days. If you don't recognize the inviter, you can
          ignore this email.
        </Text>
      </ContentSection>
    </EmailContainer>
  );
};

export default OrganizationInvitationTemplate;
