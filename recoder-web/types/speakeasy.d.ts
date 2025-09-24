declare module 'speakeasy' {
  interface GenerateSecretOptions {
    length?: number;
    symbols?: boolean;
    name?: string;
    issuer?: string;
    qr_codes?: boolean;
  }

  interface GenerateSecretResult {
    ascii: string;
    hex: string;
    base32: string;
    otpauth_url: string;
    qr_code_ascii: string;
    qr_code_hex: string;
    qr_code_base32: string;
  }

  interface VerifyOptions {
    secret: string;
    encoding?: 'base32' | 'hex' | 'ascii';
    token: string;
    window?: number;
    counter?: number;
    step?: number;
  }

  interface GenerateOptions {
    secret: string;
    encoding?: 'base32' | 'hex' | 'ascii';
    counter?: number;
    step?: number;
    time?: number;
  }

  export function generateSecret(options?: GenerateSecretOptions): GenerateSecretResult;
  
  export const totp: {
    verify(options: VerifyOptions): boolean;
    generate(options: GenerateOptions): string;
    verifyDelta(options: VerifyOptions): { delta: number } | null;
  };

  export const hotp: {
    verify(options: VerifyOptions): boolean;
    generate(options: GenerateOptions): string;
    verifyDelta(options: VerifyOptions): { delta: number } | null;
  };
}