import { describe, expect, it, vi } from 'vitest';
import { StreamingMessageParser, type ActionCallbackData } from './message-parser';

describe('StreamingMessageParser action parsing', () => {
  it('parses copy_project attributes', () => {
    const onActionOpen = vi.fn<(data: ActionCallbackData) => void>();
    const onActionClose = vi.fn<(data: ActionCallbackData) => void>();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionOpen, onActionClose },
    });

    const input = `<recoderArtifact id="a1" title="copy">
<recoderAction type="copy_project" sourceProjectId="src-123" newProjectName="My Copy" includeGit="false" includeGitRemotes="false" includeTriggers="false" includeEnvFiles="true" includeSecrets="false" includeDeployConfig="false" includeDomains="false">Copy app</recoderAction>
</recoderArtifact>`;

    parser.parse('msg-1', input);

    expect(onActionOpen).toHaveBeenCalledTimes(1);
    expect(onActionClose).toHaveBeenCalledTimes(1);

    const openAction = onActionOpen.mock.calls[0][0].action;
    const closeAction = onActionClose.mock.calls[0][0].action;

    expect(openAction.type).toBe('copy_project');
    expect(closeAction.type).toBe('copy_project');
    expect((closeAction as any).sourceProjectId).toBe('src-123');
    expect((closeAction as any).newProjectName).toBe('My Copy');
    expect((closeAction as any).includeGit).toBe(false);
    expect((closeAction as any).includeGitRemotes).toBe(false);
    expect((closeAction as any).includeTriggers).toBe(false);
    expect((closeAction as any).includeEnvFiles).toBe(true);
    expect((closeAction as any).includeSecrets).toBe(false);
  });

  it('parses web_crawl url attribute', () => {
    const onActionClose = vi.fn<(data: ActionCallbackData) => void>();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input = `<recoderArtifact id="a2" title="crawl">
<recoderAction type="web_crawl" url="https://example.com/docs" providerHint="anthropic" allowedDomains="example.com,docs.example.com" blockedDomains="admin.example.com" maxUses="2">Crawl page</recoderAction>
</recoderArtifact>`;

    parser.parse('msg-2', input);

    expect(onActionClose).toHaveBeenCalledTimes(1);
    const action = onActionClose.mock.calls[0][0].action;
    expect(action.type).toBe('web_crawl');
    expect((action as any).url).toBe('https://example.com/docs');
    expect((action as any).providerHint).toBe('anthropic');
    expect((action as any).allowedDomains).toEqual(['example.com', 'docs.example.com']);
    expect((action as any).blockedDomains).toEqual(['admin.example.com']);
    expect((action as any).maxUses).toBe(2);
  });

  it('parses github_documents attributes', () => {
    const onActionClose = vi.fn<(data: ActionCallbackData) => void>();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input = `<recoderArtifact id="a3" title="github docs">
<recoderAction type="github_documents" owner="vercel" repo="next.js" sourceType="pull_requests" maxDocuments="12" maxUses="2">Load PR docs</recoderAction>
</recoderArtifact>`;

    parser.parse('msg-3', input);

    expect(onActionClose).toHaveBeenCalledTimes(1);
    const action = onActionClose.mock.calls[0][0].action;
    expect(action.type).toBe('github_documents');
    expect((action as any).owner).toBe('vercel');
    expect((action as any).repo).toBe('next.js');
    expect((action as any).sourceType).toBe('pull_requests');
    expect((action as any).maxDocuments).toBe(12);
    expect((action as any).maxUses).toBe(2);
  });

  it('parses delegate_subagent strict attribute', () => {
    const onActionClose = vi.fn<(data: ActionCallbackData) => void>();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input = `<recoderArtifact id="a4" title="delegate">
<recoderAction type="delegate_subagent" taskDescription="Ship workflow parity" agentType="architect" context="sync contracts" strict="true">Delegate task</recoderAction>
</recoderArtifact>`;

    parser.parse('msg-4', input);

    expect(onActionClose).toHaveBeenCalledTimes(1);
    const action = onActionClose.mock.calls[0][0].action;
    expect(action.type).toBe('delegate_subagent');
    expect((action as any).taskDescription).toBe('Ship workflow parity');
    expect((action as any).agentType).toBe('architect');
    expect((action as any).context).toBe('sync contracts');
    expect((action as any).strict).toBe(true);
  });
});
