import { describe, expect, it, vi } from 'vitest';
import { recoverContainerFromDocker } from '../container-recovery';

describe('recoverContainerFromDocker', () => {
  it('recovers a running container by project label', async () => {
    const docker = {
      listContainers: vi.fn().mockResolvedValue([
        {
          Id: 'container-1234567890ab',
          Labels: {
            projectId: 'project-123',
            userId: 'anon_abc123',
          },
          Mounts: [],
          Ports: [
            { PrivatePort: 3000, PublicPort: 4100 },
            { PrivatePort: 9999, PublicPort: 4103 },
          ],
        },
      ]),
    } as any;

    const containers = new Map<string, any>();
    const logger = { log: vi.fn(), error: vi.fn() };

    const recovered = await recoverContainerFromDocker(docker, 'project-123', containers, logger);

    expect(recovered).toMatchObject({
      id: 'container-1234567890ab',
      port: 4100,
      ptyPort: 4103,
      userId: 'anon_abc123',
    });
    expect(containers.get('project-123')).toMatchObject({ id: 'container-1234567890ab', port: 4100 });
  });

  it('falls back to recoder volume matching and infers base port from Vite port', async () => {
    const docker = {
      listContainers: vi.fn().mockResolvedValue([
        {
          Id: 'container-abcdef123456',
          Labels: {},
          Mounts: [
            { Name: 'recoder-project-456-workspace' },
          ],
          Ports: [
            { PrivatePort: 5173, PublicPort: 6201 },
          ],
        },
      ]),
    } as any;

    const containers = new Map<string, any>();
    const recovered = await recoverContainerFromDocker(docker, 'project-456', containers, { log: vi.fn(), error: vi.fn() });

    expect(recovered).toMatchObject({
      id: 'container-abcdef123456',
      port: 6200,
      ptyPort: 6203,
    });
  });

  it('returns undefined when no recoverable ports are exposed', async () => {
    const docker = {
      listContainers: vi.fn().mockResolvedValue([
        {
          Id: 'container-noports',
          Labels: { projectId: 'project-789' },
          Mounts: [],
          Ports: [],
        },
      ]),
    } as any;

    const containers = new Map<string, any>();
    const logger = { log: vi.fn(), error: vi.fn() };

    const recovered = await recoverContainerFromDocker(docker, 'project-789', containers, logger);

    expect(recovered).toBeUndefined();
    expect(containers.has('project-789')).toBe(false);
  });
});
