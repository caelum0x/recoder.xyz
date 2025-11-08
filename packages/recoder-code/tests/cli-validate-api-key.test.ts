import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('CLI Validate API Key Command', () => {
  const configPath = path.join(process.cwd(), '.recoderrc');

  beforeEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  it('should set the API key and validate it', () => {
    // Set the API key
    execSync('npx recoder-code set-api-key dummy-key', { stdio: 'inherit' });

    // Validate the API key
    const result = execSync('npx recoder-code validate-api-key', { encoding: 'utf8' });

    expect(result).toContain('Open Router API key set to: validate-api-key');
  });

  it('should fail validation if API key is not set', () => {
    // Attempt to validate without setting the API key
    try {
      execSync('npx recoder-code validate-api-key', { stdio: 'inherit' });
    } catch (error) {
      const err = error as Error;
      const result = err.message;
      expect(result).toContain('Open Router API key not found. Please set it using: npx recoder-code set-api-key <your-open-router-api-key>');
    }
  });
});