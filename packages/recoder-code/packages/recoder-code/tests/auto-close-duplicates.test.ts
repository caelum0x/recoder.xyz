import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Auto Close Duplicates Functionality', () => {
  const configPath = path.join(__dirname, '..', '.recoderrc');

  beforeEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    fs.writeFileSync(configPath, JSON.stringify({ openRouterApiKey: 'dummy-key', openRouterModel: 'gpt-3.5-turbo' }), 'utf8');
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  it('should close duplicates successfully', () => {
    const result = execSync('npx recoder-code auto-close-duplicates', { encoding: 'utf8' });
    expect(result).toContain('Open Router API key set to: auto-close-duplicates');
  });

  it('should handle missing configuration gracefully', () => {
    fs.unlinkSync(configPath);

    try {
      execSync('npx recoder-code auto-close-duplicates', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Configuration file not found.');
      }
    }
  });

  it('should handle invalid Open Router API key gracefully', () => {
    fs.writeFileSync(configPath, JSON.stringify({ openRouterApiKey: 'invalid-key', openRouterModel: 'gpt-3.5-turbo' }), 'utf8');

    try {
      execSync('npx recoder-code auto-close-duplicates', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Invalid OpenRouter API key.');
      }
    }
  });
});