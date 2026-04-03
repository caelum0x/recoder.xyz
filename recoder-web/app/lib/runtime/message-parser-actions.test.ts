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

  it('normalizes legacy camelCase action aliases to canonical runtime names', () => {
    const onActionClose = vi.fn<(data: ActionCallbackData) => void>();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input = `<recoderArtifact id="a5" title="legacy aliases">
<recoderAction type="createFile" filePath="src/App.tsx">export default function App() { return null; }</recoderAction>
<recoderAction type="runShellCommand">npm install</recoderAction>
<recoderAction type="webSearch" query="vite react docs">Search docs</recoderAction>
<recoderAction type="delegateSubagent" taskDescription="Ship auth flow" agentType="coder">Delegate</recoderAction>
</recoderArtifact>`;

    parser.parse('msg-5', input);

    const actions = onActionClose.mock.calls.map((call) => call[0].action);

    expect(actions[0].type).toBe('file');
    expect((actions[0] as any).filePath).toBe('src/App.tsx');
    expect(actions[1].type).toBe('shell');
    expect(actions[2].type).toBe('web_search');
    expect((actions[2] as any).query).toBe('vite react docs');
    expect(actions[3].type).toBe('delegate_subagent');
    expect((actions[3] as any).taskDescription).toBe('Ship auth flow');
  });

  it('parses advanced canonical tool attributes that previously fell through', () => {
    const onActionClose = vi.fn<(data: ActionCallbackData) => void>();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input = `<recoderArtifact id="a6" title="advanced tools">
<recoderAction type="memory_operation" operation="store" key="project_kind" value="finance app">Store memory</recoderAction>
<recoderAction type="glob_search" pattern="src/**/*.{ts,tsx}" exclude="node_modules,dist" maxDepth="4">Glob files</recoderAction>
<recoderAction type="ripgrep_search" query="useEffect" filePattern="*.tsx" caseSensitive="false" maxResults="25">Search code</recoderAction>
<recoderAction type="edit_file" filePath="src/App.tsx" operation="replace" lineNumber="12" endLineNumber="15">const x = 1;</recoderAction>
<recoderAction type="read_many_files" filePaths="src/App.tsx,src/main.tsx" maxFileSize="4096">Read files</recoderAction>
</recoderArtifact>`;

    parser.parse('msg-6', input);

    const actions = onActionClose.mock.calls.map((call) => call[0].action as any);

    expect(actions[0].type).toBe('memory_operation');
    expect(actions[0].operation).toBe('store');
    expect(actions[0].key).toBe('project_kind');
    expect(actions[1].type).toBe('glob_search');
    expect(actions[1].pattern).toBe('src/**/*.{ts,tsx}');
    expect(actions[1].exclude).toEqual(['node_modules', 'dist']);
    expect(actions[2].type).toBe('ripgrep_search');
    expect(actions[2].maxResults).toBe(25);
    expect(actions[3].type).toBe('edit_file');
    expect(actions[3].lineNumber).toBe(12);
    expect(actions[3].endLineNumber).toBe(15);
    expect(actions[4].type).toBe('read_many_files');
    expect(actions[4].filePaths).toEqual(['src/App.tsx', 'src/main.tsx']);
    expect(actions[4].maxFileSize).toBe(4096);
  });

  it('parses hashline-aware read and edit attributes', () => {
    const onActionClose = vi.fn<(data: ActionCallbackData) => void>();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input = `<recoderArtifact id="a7" title="hashline tools">
<recoderAction type="readFile" filePath="src/App.tsx" includeLineHashes="true">Read file</recoderAction>
<recoderAction type="str_replace" filePath="src/App.tsx" oldString="const a = 1;" newString="const a = 2;" startLineRef="12#ZP" endLineRef="14#MQ">Replace text</recoderAction>
<recoderAction type="edit_file" filePath="src/App.tsx" operation="replace" lineRef="42#VR" endLineRef="43#WS">const answer = 42;</recoderAction>
</recoderArtifact>`;

    parser.parse('msg-7', input);

    const actions = onActionClose.mock.calls.map((call) => call[0].action as any);

    expect(actions[0].type).toBe('readFile');
    expect(actions[0].includeLineHashes).toBe(true);
    expect(actions[1].type).toBe('str_replace');
    expect(actions[1].startLineRef).toBe('12#ZP');
    expect(actions[1].endLineRef).toBe('14#MQ');
    expect(actions[2].type).toBe('edit_file');
    expect(actions[2].lineRef).toBe('42#VR');
    expect(actions[2].endLineRef).toBe('43#WS');
    expect(actions[2].lineNumber).toBeUndefined();
  });
});
