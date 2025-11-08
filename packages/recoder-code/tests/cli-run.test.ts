import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { mocked } from 'jest-mock';

jest.mock('openai');

describe('CLI Run Command', () => {
  const configPath = path.join(__dirname, '..', '.recoderrc');

  beforeEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    fs.writeFileSync(configPath, JSON.stringify({ apiKey: 'dummy-key', siteUrl: 'http://example.com', siteName: 'Example' }), 'utf8');
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  it('should run a prompt successfully', () => {
    const mockResponse = { data: { choices: [{ message: { content: 'Hello, world!' } }] } };
    (OpenAI.prototype.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

    const result = execSync('node cli/run.js "Hello"', { encoding: 'utf8' });
    expect(result).toContain('Hello, world!');
  });

  it('should handle missing prompt argument gracefully', () => {
    try {
      execSync('node cli/run.js', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('No prompt provided. Please provide a prompt or a file with prompts.');
      }
    }
  });

  it('should handle invalid Open Router API key gracefully', () => {
    fs.writeFileSync(configPath, JSON.stringify({ apiKey: 'invalid-key', siteUrl: 'http://example.com', siteName: 'Example' }), 'utf8');

    try {
      execSync('node cli/run.js "Hello"', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error running prompt:');
      }
    }
  });

  it('should handle network errors gracefully', () => {
    (OpenAI.prototype.chat.completions.create as jest.Mock).mockRejectedValue(new Error('Network Error'));

    try {
      execSync('node cli/run.js "Hello"', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error running prompt: Network Error');
      }
    }
  });

  it('should handle API errors gracefully', () => {
    (OpenAI.prototype.chat.completions.create as jest.Mock).mockResolvedValue({ data: { error: 'API Error' } });

    try {
      execSync('node cli/run.js "Hello"', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error running prompt: API Error');
      }
    }
  });
});

describe('CLI OpenRouter Command', () => {
  const configPath = path.join(__dirname, '..', '.recoderrc');

  beforeEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    fs.writeFileSync(configPath, JSON.stringify({ apiKey: 'dummy-key', siteUrl: 'http://example.com', siteName: 'Example' }), 'utf8');
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  it('should run a prompt successfully', () => {
    const mockResponse = { data: { choices: [{ message: { content: 'Hello, world!' } }] } };
    (OpenAI.prototype.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

    const result = execSync('node cli/run.js openrouter "Hello"', { encoding: 'utf8' });
    expect(result).toContain('Hello, world!');
  });

  it('should handle missing prompt argument gracefully', () => {
    try {
      execSync('node cli/run.js openrouter', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('No prompt provided. Please provide a prompt or a file with prompts.');
      }
    }
  });

  it('should handle invalid Open Router API key gracefully', () => {
    fs.writeFileSync(configPath, JSON.stringify({ apiKey: 'invalid-key', siteUrl: 'http://example.com', siteName: 'Example' }), 'utf8');

    try {
      execSync('node cli/run.js openrouter "Hello"', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error running prompt:');
      }
    }
  });

  it('should handle network errors gracefully', () => {
    (OpenAI.prototype.chat.completions.create as jest.Mock).mockRejectedValue(new Error('Network Error'));

    try {
      execSync('node cli/run.js openrouter "Hello"', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error running prompt: Network Error');
      }
    }
  });

  it('should handle API errors gracefully', () => {
    (OpenAI.prototype.chat.completions.create as jest.Mock).mockResolvedValue({ data: { error: 'API Error' } });

    try {
      execSync('node cli/run.js openrouter "Hello"', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error running prompt: API Error');
      }
    }
  });
});