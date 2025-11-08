import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

describe('CLI Set API Key Command', () => {
  it('should set API key successfully', () => {
    execSync('node cli/set-api-key.js dummy-key', { encoding: 'utf8' });
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    console.log('Raw Config after set-api-key:', rawConfig);
    const config = JSON.parse(rawConfig);
    console.log('Parsed Config after set-api-key:', config);
    expect(config.openRouterApiKey).toBe('dummy-key');
  });

  it('should handle missing arguments gracefully', () => {
    try {
      execSync('npx recoder-code set-api-key', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Usage: npx recoder-code set-api-key <your-open-router-api-key>');
      }
    }
  });

  it('should handle invalid API key format gracefully', () => {
    try {
      execSync('npx recoder-code set-api-key invalid-key', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Invalid OpenRouter API key.');
      }
    }
  });
});