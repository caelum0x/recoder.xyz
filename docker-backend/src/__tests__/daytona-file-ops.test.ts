import { describe, expect, it } from 'vitest';

import {
  buildDaytonaDevServerCleanupCommand,
  buildDaytonaDevServerSessionId,
} from '../daytona-file-ops';

describe('daytona dev server cleanup helpers', () => {
  it('uses a stable per-project session id', () => {
    expect(buildDaytonaDevServerSessionId('project-123')).toBe('dev-server-project-123');
  });

  it('kills pidfile, known preview ports, and stale node-based dev servers', () => {
    const command = buildDaytonaDevServerCleanupCommand();

    expect(command).toContain('cat /tmp/dev.pid');
    expect(command).toContain('for p in 5173 5174 5175 5176 5177 5178 5179 5180 3000 3001 4173 4174 8080 8081; do');
    expect(command).toContain("pkill -9 -f 'node|npm|vite|next|react-scripts|expo|metro'");
    expect(command).toContain("rm -f /tmp/dev.pid");
    expect(command).toContain(": > /tmp/dev.log");
  });
});
