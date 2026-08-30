import { describe, expect, it } from 'vitest';
import {
  canonicalRepositoryIdentity,
  parseRepositoryRemote,
  repoIdFromRemote,
} from './repo-identity.js';

describe('canonicalRepositoryIdentity', () => {
  it('collapses GitHub HTTPS, SSH, PR, and full-name forms onto one id', () => {
    for (const value of [
      'https://github.com/Acme/Widget.git',
      'git@github.com:Acme/Widget.git',
      'ssh://git@github.com/Acme/Widget.git',
      'https://github.com/Acme/Widget/pull/42',
      'Acme/Widget',
    ]) {
      const remote = parseRepositoryRemote(value);
      expect(remote && repoIdFromRemote(remote), value).toBe('acme__widget');
    }
  });

  it('uses ghq host/owner/repo layout and carries legacy aliases', () => {
    expect(canonicalRepositoryIdentity({
      repoPath: '/repos/github.com/Acme/Widget',
      projectId: 'acme-widget',
    })).toMatchObject({
      repoId: 'acme__widget',
      displayName: 'acme/widget',
      source: 'ghq',
      aliases: expect.arrayContaining(['acme-widget', 'widget']),
    });
  });

  it('lets a real remote override a basename project id', () => {
    expect(canonicalRepositoryIdentity({
      repoPath: '/work/widget',
      projectId: 'widget',
      remoteUrl: 'git@github.com:acme/widget.git',
    }).repoId).toBe('acme__widget');
  });

  it('preserves explicit non-git project ids and hashes anonymous local paths', () => {
    expect(canonicalRepositoryIdentity({ repoPath: '/work/widget', projectId: 'Project 1' }).repoId)
      .toBe('project__1');
    const first = canonicalRepositoryIdentity({ repoPath: '/work/a/widget' }).repoId;
    const second = canonicalRepositoryIdentity({ repoPath: '/work/b/widget' }).repoId;
    expect(first).toMatch(/^local__widget__[a-f0-9]{12}$/);
    expect(second).not.toBe(first);
  });

  it('includes the host for non-GitHub remotes', () => {
    expect(canonicalRepositoryIdentity({ remoteUrl: 'ssh://git@gitlab.example.com/acme/widget.git' }).repoId)
      .toBe('gitlab__example__com__acme__widget');
  });
});
