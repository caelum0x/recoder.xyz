import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), '.recoderrc');
const logPath = path.join(__dirname, '../logs/setup.log');

beforeEach(() => {
  // Clean up any existing configuration and log files
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
  if (fs.existsSync(logPath)) {
    fs.unlinkSync(logPath);
  }
});

afterEach(() => {
  // Clean up any existing configuration and log files
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
  if (fs.existsSync(logPath)) {
    fs.unlinkSync(logPath);
  }
});

test('should create a new configuration file', () => {
  const result = execSync('echo -e "sk-or-v1-testkey\\ngpt-3.5-turbo\\nhttp://proxy.example.com\\ny\\ny" | node cli/configure.js', { encoding: 'utf8' });
  expect(result).toContain('Configuration saved');
  expect(fs.existsSync(configPath)).toBe(true);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  expect(config.openRouterApiKey).toBeDefined();
  expect(config.ENCRYPTION_KEY).toBeDefined();
  expect(config.ENCRYPTION_IV).toBeDefined();
  expect(config.openRouterModel).toBe('gpt-3.5-turbo');
  expect(config.openRouterProxyUrl).toBe('http://proxy.example.com');
  expect(config.analyticsOptIn).toBe(true);
});

test('should log actions during setup', () => {
  execSync('echo -e "sk-or-v1-testkey\\ngpt-3.5-turbo\\nhttp://proxy.example.com\\ny\\ny" | node cli/configure.js', { encoding: 'utf8' });
  expect(fs.existsSync(logPath)).toBe(true);
  const logContent = fs.readFileSync(logPath, 'utf8');
  expect(logContent).toContain('User entered API key');
  expect(logContent).toContain('User entered model');
  expect(logContent).toContain('User entered proxy URL');
  expect(logContent).toContain('User opted into analytics');
  expect(logContent).toContain('User confirmed save');
  expect(logContent).toContain('Configuration saved');
});