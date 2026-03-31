import { describe, expect, it } from 'vitest';
import { evaluateMissingFileStrReplace } from './action-runner';

describe('evaluateMissingFileStrReplace', () => {
  it('rejects auto-creating missing files when a replacement target is provided', () => {
    expect(
      evaluateMissingFileStrReplace('package.json', '"recharts": "latest"', '"recharts": "latest", "react-is": "latest"'),
    ).toEqual({
      allowAutoCreate: false,
      reason: 'str_replace requires an existing file when oldString is provided',
    });
  });

  it('rejects malformed package.json payloads for missing files', () => {
    expect(
      evaluateMissingFileStrReplace('package.json', '', '"recharts": "latest", "react-is": "latest"'),
    ).toEqual({
      allowAutoCreate: false,
      reason: 'package.json auto-create requires complete valid JSON',
    });
  });

  it('allows complete new package.json payloads when no replacement target is provided', () => {
    expect(
      evaluateMissingFileStrReplace(
        'package.json',
        '',
        JSON.stringify({
          name: 'analytics-dashboard',
          private: true,
          dependencies: {
            react: 'latest',
            recharts: 'latest',
          },
        }),
      ),
    ).toEqual({ allowAutoCreate: true });
  });
});
