/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from './extension.js';

vi.mock('vscode', () => ({
  TreeItem: class {
    iconPath: unknown;
    constructor(..._args: unknown[]) {}
  },
  TreeItemCollapsibleState: { None: 0 },
  StatusBarAlignment: { Right: 2 },
  ThemeIcon: class {
    constructor(..._args: unknown[]) {}
  },
  ThemeColor: class {
    constructor(..._args: unknown[]) {}
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
    })),
    createStatusBarItem: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    withProgress: vi.fn(),
    onDidChangeActiveTextEditor: vi.fn(),
    activeTextEditor: undefined,
    tabGroups: {
      all: [],
      close: vi.fn(),
    },
    showTextDocument: vi.fn(),
    showWorkspaceFolderPick: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => false) })),
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
    onDidCloseTextDocument: vi.fn(),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    registerTextDocumentContentProvider: vi.fn(),
    onDidChangeWorkspaceFolders: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  languages: {
    registerCodeLensProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerInlineCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  ProgressLocation: { Notification: 15 },
  Uri: {
    joinPath: vi.fn(),
  },
  ExtensionMode: {
    Development: 1,
    Production: 2,
  },
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
}));

describe('activate', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = {
      subscriptions: [],
      environmentVariableCollection: {
        replace: vi.fn(),
      },
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
      },
      extensionUri: {
        fsPath: '/path/to/extension',
      },
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show the info message on first activation', async () => {
    const showInformationMessageMock = vi
      .mocked(vscode.window.showInformationMessage)
      .mockResolvedValue(undefined as never);
    vi.mocked(context.globalState.get).mockReturnValue(undefined);
    await activate(context);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Recoder Code Companion extension successfully installed.',
    );
  });

  it('should not show the info message on subsequent activations', async () => {
    vi.mocked(context.globalState.get).mockImplementation(
      (key) => key === 'recoderCodeInfoMessageShown' ? true : undefined,
    );
    await activate(context);
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('should launch Recoder Code when the user clicks the button', async () => {
    const showInformationMessageMock = vi
      .mocked(vscode.window.showInformationMessage)
      .mockResolvedValue('Run Recoder Code' as never);
    vi.mocked(context.globalState.get).mockReturnValue(undefined);
    await activate(context);
    expect(showInformationMessageMock).toHaveBeenCalled();
    await new Promise(process.nextTick); // Wait for the promise to resolve
    const commandCallback = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === 'recoder-code.runRecoder')?.[1];

    expect(commandCallback).toBeDefined();
  });
});
