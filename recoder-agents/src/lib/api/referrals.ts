import { backendApi } from '@/lib/api-client';
import {
  parseReferralCodeResponse,
  parseReferralEmailResponse,
  parseReferralListResponse,
  parseReferralStatsResponse,
  parseValidateReferralCodeResponse,
} from './contracts';

export interface ReferralCodeResponse {
  referral_code: string;
  referral_url: string;
}

export interface ReferralStats {
  referral_code: string;
  total_referrals: number;
  successful_referrals: number;
  total_credits_earned: number;
  last_referral_at: string | null;
  remaining_earnable_credits: number;
  max_earnable_credits: number;
  has_reached_limit: boolean;
}

export interface Referral {
  id: string;
  referred_account_id: string;
  credits_awarded: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface ReferralListResponse {
  referrals: Referral[];
  total_count: number;
}

export interface ValidateReferralCodeResponse {
  valid: boolean;
  referrer_id?: string;
  message?: string;
}

export interface ReferralEmailResult {
  email: string;
  success: boolean;
  message?: string;
}

export interface ReferralEmailResponse {
  success: boolean;
  message?: string;
  results?: ReferralEmailResult[];
  success_count?: number;
  total_count?: number;
}

export const referralsApi = {
  getReferralCode: async (): Promise<ReferralCodeResponse> => {
    const response = await backendApi.get<unknown>('/referrals/code');
    if (!response.success || !response.data) {
      throw new Error('GET_CODE_FAILED');
    }
    return parseReferralCodeResponse(response.data) as ReferralCodeResponse;
  },

  refreshReferralCode: async (): Promise<ReferralCodeResponse> => {
    const response = await backendApi.post<unknown>('/referrals/code/refresh', {});
    if (!response.success || !response.data) {
      throw new Error('REFRESH_CODE_FAILED');
    }
    return parseReferralCodeResponse(response.data) as ReferralCodeResponse;
  },

  validateReferralCode: async (code: string): Promise<ValidateReferralCodeResponse> => {
    const response = await backendApi.post<unknown>(
      '/referrals/validate',
      { referral_code: code }
    );
    if (!response.success || !response.data) {
      throw new Error('VALIDATE_CODE_FAILED');
    }
    return parseValidateReferralCodeResponse(response.data) as ValidateReferralCodeResponse;
  },

  getReferralStats: async (): Promise<ReferralStats> => {
    const response = await backendApi.get<unknown>('/referrals/stats');
    if (!response.success || !response.data) {
      throw new Error('GET_STATS_FAILED');
    }
    return parseReferralStatsResponse(response.data) as ReferralStats;
  },

  getUserReferrals: async (limit = 50, offset = 0): Promise<ReferralListResponse> => {
    const response = await backendApi.get<unknown>(
      `/referrals/list?limit=${limit}&offset=${offset}`
    );
    if (!response.success || !response.data) {
      throw new Error('GET_REFERRALS_FAILED');
    }
    return parseReferralListResponse(response.data) as ReferralListResponse;
  },

  sendReferralEmails: async (emails: string[]): Promise<ReferralEmailResponse> => {
    const response = await backendApi.post<unknown>(
      '/referrals/email',
      { emails }
    );
    if (!response.success || !response.data) {
      throw new Error('SEND_EMAILS_FAILED');
    }
    return parseReferralEmailResponse(response.data) as ReferralEmailResponse;
  },
};
