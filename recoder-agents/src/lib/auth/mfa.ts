import {
  type AALResponse,
  type ChallengeResponse,
  type EnrollFactorResponse,
  type FactorInfo,
  type ListFactorsResponse,
  type PhoneVerificationChallenge,
  type PhoneVerificationChallengeAndVerify,
  type PhoneVerificationEnroll,
  type PhoneVerificationResponse,
  type PhoneVerificationVerify,
} from '@/lib/api/phone-verification';
import { requireSessionAccessToken } from '@/lib/auth/session-token';
import { z } from 'zod';

// Cutoff date for new user phone verification requirement.
const PHONE_VERIFICATION_CUTOFF_DATE = new Date('2025-12-24T00:09:30.000Z');

function getBackendUrl(): string {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_BACKEND_URL is not configured');
  }
  return url.replace(/\/$/, '');
}

type ApiErrorResponse = {
  detail?: string;
  message?: string;
  error?: string;
};

async function mfaRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    token: string;
    body?: Record<string, unknown>;
  },
  parseResponse: (payload: unknown) => T
): Promise<T> {
  const url = `${getBackendUrl()}/mfa${path}`;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as ApiErrorResponse;
    const message =
      errorPayload.detail ||
      errorPayload.message ||
      errorPayload.error ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json().catch(() => ({}));
  return parseResponse(payload);
}

const factorInfoSchema = z.object({
  id: z.string(),
  friendly_name: z.string().optional(),
  factor_type: z.string().optional(),
  status: z.string().optional(),
  phone: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const enrollFactorResponseSchema = z.object({
  id: z.string(),
  friendly_name: z.string(),
  phone_number: z.string(),
});

const challengeResponseSchema = z.object({
  id: z.string(),
  expires_at: z.string().optional(),
});

const phoneVerificationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

const listFactorsResponseSchema = z.object({
  factors: z.array(factorInfoSchema).default([]),
});

const aalResponseSchema = z.object({
  current_level: z.string().optional(),
  next_level: z.string().optional(),
  current_authentication_methods: z.array(z.string()).optional(),
  action_required: z.string().optional(),
  message: z.string().optional(),
  phone_verification_required: z.boolean().optional(),
  user_created_at: z.string().optional(),
  cutoff_date: z.string().optional(),
  verification_required: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  factors: z.array(factorInfoSchema).optional(),
});

function isPhoneVerificationMandatory(): boolean {
  const envVal = process.env.NEXT_PUBLIC_PHONE_NUMBER_MANDATORY;
  if (!envVal) return false;
  return envVal.toLowerCase() === 'true';
}

export const authProviderMFAService = {
  /**
   * Enroll phone number for SMS-based 2FA.
   */
  async enrollPhoneNumber(data: PhoneVerificationEnroll): Promise<EnrollFactorResponse> {
    const token = await requireSessionAccessToken();
    const response = await mfaRequest(
      '/enroll',
      {
        method: 'POST',
        token,
        body: {
          phone_number: data.phone_number,
          friendly_name: data.friendly_name,
        },
      },
      (payload) => enrollFactorResponseSchema.parse(payload)
    );

    return {
      id: response.id,
      friendly_name: response.friendly_name,
      phone_number: response.phone_number,
    };
  },

  /**
   * Create a challenge for an enrolled phone factor (sends SMS).
   */
  async createChallenge(data: PhoneVerificationChallenge): Promise<ChallengeResponse> {
    const token = await requireSessionAccessToken();
    const response = await mfaRequest(
      '/challenge',
      {
        method: 'POST',
        token,
        body: { factor_id: data.factor_id },
      },
      (payload) => challengeResponseSchema.parse(payload)
    );

    return {
      id: response.id,
      expires_at: response.expires_at,
    };
  },

  /**
   * Verify SMS code for phone verification.
   */
  async verifyChallenge(data: PhoneVerificationVerify): Promise<PhoneVerificationResponse> {
    const token = await requireSessionAccessToken();
    const response = await mfaRequest(
      '/verify',
      {
        method: 'POST',
        token,
        body: {
          factor_id: data.factor_id,
          challenge_id: data.challenge_id,
          code: data.code,
        },
      },
      (payload) => phoneVerificationResponseSchema.parse(payload)
    );

    return {
      success: response.success,
      message: response.message || 'SMS code verified successfully',
    };
  },

  /**
   * Create challenge and verify in one step.
   */
  async challengeAndVerify(
    data: PhoneVerificationChallengeAndVerify
  ): Promise<PhoneVerificationResponse> {
    const challenge = await this.createChallenge({ factor_id: data.factor_id });
    return this.verifyChallenge({
      factor_id: data.factor_id,
      challenge_id: challenge.id,
      code: data.code,
    });
  },

  /**
   * Resend SMS code (create new challenge for existing factor).
   */
  async resendSMS(factorId: string): Promise<ChallengeResponse> {
    return this.createChallenge({ factor_id: factorId });
  },

  /**
   * List all enrolled MFA factors.
   */
  async listFactors(): Promise<ListFactorsResponse> {
    const token = await requireSessionAccessToken();
    const response = await mfaRequest(
      '/factors',
      {
        token,
      },
      (payload) => listFactorsResponseSchema.parse(payload)
    );
    return { factors: (response.factors || []) as FactorInfo[] };
  },

  /**
   * Remove phone verification from account.
   */
  async unenrollFactor(factorId: string): Promise<PhoneVerificationResponse> {
    const token = await requireSessionAccessToken();
    const response = await mfaRequest(
      `/factors/${factorId}`,
      {
        method: 'DELETE',
        token,
      },
      (payload) => phoneVerificationResponseSchema.parse(payload)
    );
    return {
      success: response.success,
      message: response.message || 'Phone factor unenrolled successfully',
    };
  },

  /**
   * Get Authenticator Assurance Level.
   */
  async getAAL(): Promise<AALResponse> {
    const token = await requireSessionAccessToken();
    return mfaRequest('/status', { token }, (payload) => aalResponseSchema.parse(payload) as AALResponse);
  },
};
