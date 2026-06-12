export type MemoryItemStatus = 'active' | 'superseded' | 'expired';
export type MemoryCandidateStatus = 'candidate_created' | 'reviewed' | 'accepted' | 'rejected';
export type MemoryItemScope = 'user' | 'org' | 'space' | 'repo' | 'path' | 'agent' | 'task-type';

export const MemoryItemStatusEnum = {
  Active: 'active' as const satisfies MemoryItemStatus,
  Superseded: 'superseded' as const satisfies MemoryItemStatus,
  Expired: 'expired' as const satisfies MemoryItemStatus,
} as const;

export const MEMORY_ITEM_STATUSES: readonly MemoryItemStatus[] = [
  MemoryItemStatusEnum.Active,
  MemoryItemStatusEnum.Superseded,
  MemoryItemStatusEnum.Expired,
] as const;

export const MemoryCandidateStatusEnum = {
  CandidateCreated: 'candidate_created' as const satisfies MemoryCandidateStatus,
  Reviewed: 'reviewed' as const satisfies MemoryCandidateStatus,
  Accepted: 'accepted' as const satisfies MemoryCandidateStatus,
  Rejected: 'rejected' as const satisfies MemoryCandidateStatus,
} as const;

export const MEMORY_CANDIDATE_STATUSES: readonly MemoryCandidateStatus[] = [
  MemoryCandidateStatusEnum.CandidateCreated,
  MemoryCandidateStatusEnum.Reviewed,
  MemoryCandidateStatusEnum.Accepted,
  MemoryCandidateStatusEnum.Rejected,
] as const;

export const MemoryScopeEnum = {
  User: 'user' as const satisfies MemoryItemScope,
  Org: 'org' as const satisfies MemoryItemScope,
  Space: 'space' as const satisfies MemoryItemScope,
  Repo: 'repo' as const satisfies MemoryItemScope,
  Path: 'path' as const satisfies MemoryItemScope,
  Agent: 'agent' as const satisfies MemoryItemScope,
  TaskType: 'task-type' as const satisfies MemoryItemScope,
} as const;

export const MEMORY_SCOPES: readonly MemoryItemScope[] = [
  MemoryScopeEnum.User,
  MemoryScopeEnum.Org,
  MemoryScopeEnum.Space,
  MemoryScopeEnum.Repo,
  MemoryScopeEnum.Path,
  MemoryScopeEnum.Agent,
  MemoryScopeEnum.TaskType,
] as const;

export type MemoryItem = {
  memoryId: string;
  scope: MemoryItemScope;
  title: string;
  body: string;
  status: MemoryItemStatus;
  evidence: {
    taskId: string;
    artifactId: string;
  };
  createdAt: string;
  acceptedBy: string;
  expiresAt?: string | null;
  supersedesMemoryId?: string;
};

export type MemoryCandidate = {
  candidateId: string;
  scope: MemoryItem['scope'];
  title: string;
  body: string;
  status: MemoryCandidateStatus;
  evidence: {
    taskId: string;
    artifactId: string;
  };
  proposedBy: string;
  proposedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
  expiresAt?: string | null;
};
