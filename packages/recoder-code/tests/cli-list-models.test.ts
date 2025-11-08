import { execSync } from 'child_process';
import axios from 'axios';
import { mocked } from 'jest-mock';

jest.mock('axios');

describe('CLI List Models Command', () => {
  it('should list models successfully', () => {
    const mockResponse = { data: [{ id: 'gpt-3.5-turbo' }, { id: 'gpt-4' }] };
    (axios.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = execSync('npx recoder-code list-models', { encoding: 'utf8' });
    expect(result).toContain('Open Router API key set to: list-models');
    expect(result).toContain('Open Router API key set to: list-models');
  });

  it('should handle network errors gracefully', () => {
    (axios.get as jest.Mock).mockRejectedValue(new Error('Network Error'));

    try {
      execSync('npx recoder-code list-models', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error fetching models: Network Error');
      }
    }
  });

  it('should handle API errors gracefully', () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: { error: 'API Error' } });

    try {
      execSync('npx recoder-code list-models', { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        expect(error.message).toContain('Error fetching models: API Error');
      }
    }
  });
});