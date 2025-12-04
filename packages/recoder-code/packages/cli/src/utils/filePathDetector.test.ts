import { describe, it, expect } from 'vitest';
import { detectFilePaths } from './filePathDetector.js';

describe('detectFilePaths', () => {
  it('detects Unix paths', () => {
    const result = detectFilePaths('/Users/test/file.txt');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/Users/test/file.txt');
  });

  it('detects quoted paths with spaces', () => {
    const result = detectFilePaths('"/Users/test/my file.txt"');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/Users/test/my file.txt');
    expect(result[0].quoted).toBe(true);
  });

  it('detects multiple paths', () => {
    const result = detectFilePaths('/path/one /path/two');
    expect(result).toHaveLength(2);
  });

  it('detects Windows paths', () => {
    const result = detectFilePaths('C:\\Users\\test\\file.txt');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('C:\\Users\\test\\file.txt');
  });

  it('handles mixed text and paths', () => {
    const result = detectFilePaths('Check this file /Users/test/file.txt please');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/Users/test/file.txt');
  });
});
