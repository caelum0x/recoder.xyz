import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/api/config';
import {
    parseAccountDeletionStatus,
    parseApiErrorMessage,
    parseCancelDeletionResponse,
    parseRequestDeletionResponse,
} from '@/api/contracts';
import { requireSessionAccessToken } from '@/lib/auth/session-token';

export interface AccountDeletionStatus {
    has_pending_deletion: boolean;
    deletion_scheduled_for: string | null;
    requested_at: string | null;
    can_cancel: boolean;
}

export interface RequestDeletionResponse {
    success: boolean;
    message: string;
    deletion_scheduled_for: string;
    can_cancel: boolean;
}

export interface CancelDeletionResponse {
    success: boolean;
    message: string;
}

const ACCOUNT_DELETION_QUERY_KEY = ['account', 'deletion-status'];

async function getAuthHeaders() {
    const token = await requireSessionAccessToken();
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

export function useAccountDeletionStatus(options?: { enabled?: boolean }) {
    return useQuery<AccountDeletionStatus>({
        queryKey: ACCOUNT_DELETION_QUERY_KEY,
        queryFn: async () => {
            const headers = await getAuthHeaders();
            
            const response = await fetch(`${API_URL}/account/deletion-status`, {
                headers,
            });

            if (!response.ok) {
                return {
                    has_pending_deletion: false,
                    deletion_scheduled_for: null,
                    requested_at: null,
                    can_cancel: false
                };
            }

            const parsed = parseAccountDeletionStatus(await response.json().catch(() => null));
            if (!parsed) {
                return {
                    has_pending_deletion: false,
                    deletion_scheduled_for: null,
                    requested_at: null,
                    can_cancel: false
                };
            }

            return parsed;
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        ...options,
    });
}

export function useRequestAccountDeletion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (reason?: string) => {
            const headers = await getAuthHeaders();

            const response = await fetch(`${API_URL}/account/request-deletion`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ reason: reason || 'User requested deletion' }),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(parseApiErrorMessage(errorPayload) || 'Failed to request account deletion');
            }

            const parsed = parseRequestDeletionResponse(await response.json().catch(() => null));
            if (!parsed) {
                throw new Error('Invalid account deletion request response payload');
            }
            return parsed;
        },
        onSuccess: (data) => {
            queryClient.setQueryData<AccountDeletionStatus>(ACCOUNT_DELETION_QUERY_KEY, {
                has_pending_deletion: true,
                deletion_scheduled_for: data.deletion_scheduled_for,
                requested_at: new Date().toISOString(),
                can_cancel: data.can_cancel
            });
        },
    });
}

export function useCancelAccountDeletion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const headers = await getAuthHeaders();

            const response = await fetch(`${API_URL}/account/cancel-deletion`, {
                method: 'POST',
                headers,
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(parseApiErrorMessage(errorPayload) || 'Failed to cancel account deletion');
            }

            const parsed = parseCancelDeletionResponse(await response.json().catch(() => null));
            if (!parsed) {
                throw new Error('Invalid account deletion cancel response payload');
            }
            return parsed;
        },
        onSuccess: () => {
            queryClient.setQueryData<AccountDeletionStatus>(ACCOUNT_DELETION_QUERY_KEY, {
                has_pending_deletion: false,
                deletion_scheduled_for: null,
                requested_at: null,
                can_cancel: false
            });
        },
    });
}
