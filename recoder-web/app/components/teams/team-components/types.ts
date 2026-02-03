// Type definitions for team management

export type Member = {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: Date | string;
  user?: {
    id: string;
    name?: string;
    email: string;
    image?: string;
  };
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date | string;
  organizationId: string;
  inviterId: string;
  teamId?: string;
};

// Status definitions
export type MemberStatus = 'active' | 'inactive' | 'pending' | 'blocked';
export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'expired'
  | 'canceled'
  | 'rejected';

// Form parameter types
export type HandleInviteMemberParams = {
  email: string;
  role: string;
};

// Component property types
export interface InviteFormProps {
  onInvite: (params: HandleInviteMemberParams) => Promise<void>;
  isLoading: boolean;
}

export interface MemberTableProps {
  members: Member[];
  isLoading: boolean;
  organizationId: string;
  onUpdateRole: (memberId: string, role: string) => Promise<void>;
  onRemoveMember: (
    memberId: string,
    organizationId: string,
    name?: string,
    email?: string
  ) => Promise<void>;
}

export interface InvitationTableProps {
  invitations: Invitation[];
  isLoading: boolean;
  onCancelInvitation: (invitationId: string, email: string) => Promise<void>;
}
