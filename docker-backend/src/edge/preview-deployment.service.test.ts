import { beforeEach, describe, expect, it } from 'vitest';
import { getPreviewDeploymentService, resetPreviewDeploymentService } from './preview-deployment.service.js';
import { verifyPreviewAccessToken } from './preview-access.js';

describe('preview-deployment.service', () => {
  beforeEach(() => {
    resetPreviewDeploymentService();
  });

  it('creates a protected preview deployment with edge metadata', () => {
    const deployment = getPreviewDeploymentService().create({
      projectId: 'project-1',
      taskId: 'task-1',
      branchName: 'feature/preview',
      prNumber: 7,
      createdBy: 'tester',
      protectionMode: 'signed',
    });

    expect(deployment.projectId).toBe('project-1');
    expect(deployment.edgeHost).toContain('preview-project-1-');
    expect(deployment.protectedPreviewUrl).toContain('/preview-access/');
    expect(deployment.artifactKey).toContain('preview-deployment:');

    const token = decodeURIComponent(deployment.protectedPreviewPath.split('/')[2] || '');
    const verification = verifyPreviewAccessToken(token, {
      projectId: 'project-1',
      deploymentId: deployment.id,
    });
    expect(verification.ok).toBe(true);
  });

  it('returns the latest deployment for a project', () => {
    const service = getPreviewDeploymentService();
    service.create({ projectId: 'project-1', createdBy: 'tester', protectionMode: 'public' });
    const second = service.create({ projectId: 'project-1', createdBy: 'tester', protectionMode: 'signed' });

    expect(service.getLatestByProject('project-1')?.id).toBe(second.id);
    expect(service.listRecent(1)[0].id).toBe(second.id);
  });
});

