/**
 * Connectors config detection test — proves the env boundary truthfully reports
 * each of the seven channels as configured (credentials present) or NOT
 * (configured:false + the reason naming the missing env var), using REAL env
 * vars and the REAL per-channel adapter detectors. Nothing here contacts a
 * network; this is purely the untrusted-env -> typed-config boundary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConnectorsConfig } from './config';
import { SUPPORTED_CHANNELS } from './channel-adapters';

/**
 * Env keys this test sets/clears so each case starts from a clean slate. The
 * plain names plus the RECODER_CONNECTORS_* / OPENCLAW_* prefixed variants the
 * detectors consult — cleared so a developer's real env never leaks into a case.
 */
const PLAIN_KEYS = [
  'CONNECTORS_CHANNELS',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ACCOUNT_ID',
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_ACCOUNT_ID',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_ACCOUNT_ID',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'LINE_ACCOUNT_ID',
  'SIGNAL_ACCOUNT',
  'SIGNAL_BASE_URL',
  'WHATSAPP_BASE_URL',
  'WHATSAPP_TOKEN',
  'WHATSAPP_ACCOUNT_ID',
  'IMESSAGE_ENABLED',
  'IMESSAGE_ACCOUNT_ID',
  'DISCORD_BOT_TOKEN',
  'DISCORD_ACCOUNT_ID',
];
const ENV_KEYS = [
  ...PLAIN_KEYS,
  ...PLAIN_KEYS.map((k) => `RECODER_CONNECTORS_${k}`),
  ...PLAIN_KEYS.map((k) => `OPENCLAW_${k}`),
  'RECODER_CONNECTORS_CHANNELS',
  'OPENCLAW_CHANNELS',
  'RECODER_IMESSAGE_ENABLED',
  'OPENCLAW_IMESSAGE_ENABLED',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('loadConnectorsConfig — truthful per-channel detection', () => {
  it('with NO channel credentials, every supported channel is reported unconfigured (configured:false + reason)', () => {
    const config = loadConnectorsConfig();
    expect(config.channels).toHaveLength(0);
    // All seven supported channels appear as unconfigured, each with a reason.
    const reportedKinds = config.unconfigured.map((u) => u.channel).sort();
    expect(reportedKinds).toEqual([...SUPPORTED_CHANNELS].sort());
    for (const u of config.unconfigured) {
      expect(u.reason, `${u.channel} must carry a missing-credential reason`).toBeTruthy();
    }
  });

  it('telegram with a bot token is configured; the rest stay unconfigured', () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:abc';
    const config = loadConnectorsConfig();
    const telegram = config.channels.find((c) => c.channel === 'telegram');
    expect(telegram).toBeTruthy();
    expect(telegram!.token).toBe('123:abc');
    expect(telegram!.requiresExternal).toBe(false);
    // The other six are still unconfigured.
    expect(config.unconfigured.some((u) => u.channel === 'slack')).toBe(true);
  });

  it('slack with only a bot token (no app token / signing secret) is NOT configured (truthful reason)', () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    const config = loadConnectorsConfig();
    expect(config.channels.some((c) => c.channel === 'slack')).toBe(false);
    const slack = config.unconfigured.find((u) => u.channel === 'slack');
    expect(slack).toBeTruthy();
    expect(slack!.reason).toMatch(/SLACK_APP_TOKEN|SLACK_SIGNING_SECRET/);
  });

  it('slack with bot token + app token IS configured (Socket Mode ingress runs from config)', () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.SLACK_APP_TOKEN = 'xapp-test';
    const config = loadConnectorsConfig();
    const slack = config.channels.find((c) => c.channel === 'slack');
    expect(slack).toBeTruthy();
    expect(slack!.requiresExternal).toBe(false);
  });

  it('feishu with app id + secret is configured', () => {
    process.env.FEISHU_APP_ID = 'cli_app';
    process.env.FEISHU_APP_SECRET = 'secret';
    const config = loadConnectorsConfig();
    expect(config.channels.some((c) => c.channel === 'feishu')).toBe(true);
  });

  it('line with creds is configured but marked requiresExternal (needs an HTTP webhook ingress)', () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'line-token';
    process.env.LINE_CHANNEL_SECRET = 'line-secret';
    const config = loadConnectorsConfig();
    const line = config.channels.find((c) => c.channel === 'line');
    expect(line).toBeTruthy();
    expect(line!.requiresExternal).toBe(true);
    expect(line!.note).toBeTruthy();
  });

  it('signal with account + daemon base url is configured but requiresExternal (needs the signal-cli daemon)', () => {
    process.env.SIGNAL_ACCOUNT = '+15550000000';
    process.env.SIGNAL_BASE_URL = 'http://127.0.0.1:8080';
    const config = loadConnectorsConfig();
    const signal = config.channels.find((c) => c.channel === 'signal');
    expect(signal).toBeTruthy();
    expect(signal!.requiresExternal).toBe(true);
  });

  it('CONNECTORS_CHANNELS pins the enabled set (telegram only) even when other creds are present', () => {
    process.env.CONNECTORS_CHANNELS = 'telegram';
    process.env.TELEGRAM_BOT_TOKEN = '123:abc';
    process.env.FEISHU_APP_ID = 'cli_app';
    process.env.FEISHU_APP_SECRET = 'secret';
    const config = loadConnectorsConfig();
    expect(config.channels.map((c) => c.channel)).toEqual(['telegram']);
    // feishu is not even a candidate, so it is not in unconfigured either.
    expect(config.unconfigured.some((u) => u.channel === 'feishu')).toBe(false);
  });
});
