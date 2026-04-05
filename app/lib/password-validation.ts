export interface PasswordValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
}

const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  } else {
    score += 1;
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must include a lowercase letter');
  } else {
    score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include an uppercase letter');
  } else {
    score += 1;
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must include a number');
  } else {
    score += 1;
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must include a special character');
  } else {
    score += 1;
  }

  return {
    valid: errors.length === 0,
    score,
    errors,
  };
}
