import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('OpenRouter API Connectivity', () => {
  it('should return a successful response for a valid prompt', async () => {
    const { stdout, stderr } = await execAsync('node cli/run.js "Explain the concept of recursion in programming." -m 200');
    expect(stderr).toBe('');
    expect(stdout).toContain('recursion');
  }, 60000); // Increase timeout to 60 seconds

  it('should handle rate limiting gracefully', async () => {
    // Simulate rate limiting by sending multiple requests in quick succession
    const promises = Array.from({ length: 10 }, () => execAsync('node cli/run.js "Test prompt" -m 50'));
    const results = await Promise.allSettled(promises);

    const successfulResponses = results.filter(result => result.status === 'fulfilled');
    const rateLimitResponses = results.filter(result => result.status === 'rejected' && result.reason && result.reason.message && result.reason.message.includes('Rate limit exceeded'));

    expect(successfulResponses.length).toBeGreaterThanOrEqual(1);
    expect(rateLimitResponses.length).toBeGreaterThanOrEqual(1);
  }, 120000); // Increase timeout to 120 seconds for multiple requests

  it('should handle invalid API keys gracefully', async () => {
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'invalid_api_key';

    try {
      const { stderr } = await execAsync('node cli/run.js "Test prompt" -m 50');
      expect(stderr).toContain('No valid Open Router API key found');
    } finally {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }, 60000); // Increase timeout to 60 seconds

  it('should handle network errors gracefully', async () => {
    // Simulate network error by using an invalid URL
    const originalApiUrl = process.env.OPENROUTER_API_URL;
    process.env.OPENROUTER_API_URL = 'https://invalid-url.com/v1/models/gpt-3.5-turbo/completions';

    try {
      const { stderr } = await execAsync('node cli/run.js "Test prompt" -m 50');
      expect(stderr).toContain('Error running prompt');
    } finally {
      process.env.OPENROUTER_API_URL = originalApiUrl;
    }
  }, 60000); // Increase timeout to 60 seconds
});