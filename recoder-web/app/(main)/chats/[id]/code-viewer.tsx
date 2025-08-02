"use client";

import ChevronLeftIcon from "@/components/icons/chevron-left";
import ChevronRightIcon from "@/components/icons/chevron-right";
import CloseIcon from "@/components/icons/close-icon";
import RefreshIcon from "@/components/icons/refresh";
import { extractFirstCodeBlock, splitByFirstCodeFence } from "@/lib/utils";
import { useState } from "react";
import type { Chat, Message } from "./page";
import { Share } from "./share";
import { StickToBottom } from "use-stick-to-bottom";
import dynamic from "next/dynamic";

const CodeRunner = dynamic(() => import("@/components/code-runner"), {
  ssr: false,
});
const EnhancedCodeRunner = dynamic(() => import("@/components/enhanced-code-runner"), {
  ssr: false,
});
const DeploymentPipeline = dynamic(() => import("@/components/deployment-pipeline"), {
  ssr: false,
});
const SyntaxHighlighter = dynamic(
  () => import("@/components/syntax-highlighter"),
  {
    ssr: false,
  },
);
const CodeEditorWorkspace = dynamic(() => import("@/components/code-editor-workspace"), {
  ssr: false,
});

export default function CodeViewer({
  chat,
  streamText,
  message,
  onMessageChange,
  activeTab,
  onTabChange,
  onClose,
  onRequestFix,
}: {
  chat: Chat;
  streamText: string;
  message?: Message;
  onMessageChange: (v: Message) => void;
  activeTab: string;
  onTabChange: (v: "code" | "preview" | "deploy") => void;
  onClose: () => void;
  onRequestFix: (e: string) => void;
}) {
  const app = message ? extractFirstCodeBlock(message.content) : undefined;
  const streamAppParts = splitByFirstCodeFence(streamText);
  const streamApp = streamAppParts.find(
    (p) =>
      p.type === "first-code-fence-generating" || p.type === "first-code-fence",
  );
  const streamAppIsGenerating = streamAppParts.some(
    (p) => p.type === "first-code-fence-generating",
  );

  const code = streamApp ? streamApp.content : app?.code || "";
  const language = streamApp ? streamApp.language : app?.language || "";
  const title = streamApp ? streamApp.filename.name : app?.filename?.name || "";
  const layout = ["python", "ts", "js", "javascript", "typescript"].includes(
    language,
  )
    ? "two-up"
    : "tabbed";

  const assistantMessages = chat.messages.filter((m) => m.role === "assistant");
  const currentVersion = streamApp
    ? assistantMessages.length
    : message
      ? assistantMessages.map((m) => m.id).indexOf(message.id)
      : 1;
  const previousMessage =
    currentVersion !== 0 ? assistantMessages.at(currentVersion - 1) : undefined;
  const nextMessage =
    currentVersion < assistantMessages.length
      ? assistantMessages.at(currentVersion + 1)
      : undefined;

  const [refresh, setRefresh] = useState(0);
  const [useEnhancedRunner, setUseEnhancedRunner] = useState(true);
  const [useCodeEditor, setUseCodeEditor] = useState(true);
  const [deploymentStatus, setDeploymentStatus] = useState<"idle" | "deploying" | "deployed">("idle");

  // Analyze code to determine capabilities
  const analyzeCodeCapabilities = (codeContent: string) => {
    const hasDatabase = /database|prisma|mongoose|sequelize|db\./i.test(codeContent);
    const hasAPI = /fetch|axios|api|endpoint|\/api/i.test(codeContent);
    const hasAuth = /auth|login|session|jwt|token/i.test(codeContent);
    const isReactApp = /react|jsx|tsx|component/i.test(codeContent) || language.includes('react');
    
    return {
      hasDatabase,
      hasAPI,
      hasAuth,
      realFunctionality: hasDatabase || hasAPI || hasAuth,
      framework: isReactApp ? 'react' : language === 'javascript' ? 'vanilla' : 'react'
    };
  };

  const codeCapabilities = analyzeCodeCapabilities(code);
  const projectName = title || `${chat.title.slice(0, 20)}-v${currentVersion + 1}`;

  const handleDeployment = (projectFiles: any) => {
    setDeploymentStatus("deploying");
    // Simulate deployment process
    setTimeout(() => {
      setDeploymentStatus("deployed");
    }, 3000);
  };

  // Convert single code block to file structure
  const createFileStructure = (codeContent: string, fileName: string, lang: string) => {
    const files = [{
      id: "main-file",
      name: fileName || `main.${lang === 'typescript' ? 'tsx' : lang === 'javascript' ? 'jsx' : lang}`,
      type: "file" as const,
      content: codeContent,
      language: lang === 'typescript' ? 'typescript' : lang === 'javascript' ? 'javascript' : lang,
    }];

    // Add common supporting files based on framework detection
    if (codeCapabilities.framework === 'react') {
      files.push({
        id: "package-json",
        name: "package.json",
        type: "file" as const,
        language: "json",
        content: `{
  "name": "${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "vite preview"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"${codeCapabilities.hasDatabase ? ',\n    "prisma": "^5.0.0"' : ''}${codeCapabilities.hasAuth ? ',\n    "next-auth": "^4.0.0"' : ''}
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}`,
      });

      if (codeCapabilities.hasDatabase) {
        files.push({
          id: "prisma-schema",
          name: "prisma/schema.prisma",
          type: "file" as const,
          language: "prisma",
          content: `// Auto-generated database schema
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`,
        });
      }
    }

    return files;
  };

  const editorFiles = createFileStructure(code, title, language);

  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-300 px-4">
        <div className="inline-flex items-center gap-4">
          <button
            className="text-gray-400 hover:text-gray-700"
            onClick={onClose}
          >
            <CloseIcon className="size-5" />
          </button>
          <span>
            {title} v{currentVersion + 1}
          </span>
          <label className="flex items-center gap-2 text-xs bg-gray-100 px-2 py-1 rounded">
            <input
              type="checkbox"
              checked={useCodeEditor}
              onChange={(e) => setUseCodeEditor(e.target.checked)}
              className="rounded"
            />
            Enhanced Editor
          </label>
        </div>
        {layout === "tabbed" && (
          <div className="rounded-lg border-2 border-gray-300 p-1">
            <button
              onClick={() => onTabChange("code")}
              data-active={activeTab === "code" ? true : undefined}
              className="inline-flex h-7 w-16 items-center justify-center rounded text-xs font-medium data-[active]:bg-blue-500 data-[active]:text-white"
            >
              Code
            </button>
            <button
              onClick={() => onTabChange("preview")}
              data-active={activeTab === "preview" ? true : undefined}
              className="inline-flex h-7 w-16 items-center justify-center rounded text-xs font-medium data-[active]:bg-blue-500 data-[active]:text-white"
            >
              Preview
            </button>
            <button
              onClick={() => onTabChange("deploy")}
              data-active={activeTab === "deploy" ? true : undefined}
              className="inline-flex h-7 w-16 items-center justify-center rounded text-xs font-medium data-[active]:bg-blue-500 data-[active]:text-white"
            >
              Deploy
            </button>
          </div>
        )}
      </div>

      {layout === "tabbed" ? (
        <div className="flex grow flex-col overflow-y-auto bg-white">
          {activeTab === "code" ? (
            useCodeEditor ? (
              <div className="flex-1 overflow-hidden">
                <CodeEditorWorkspace
                  initialFiles={editorFiles}
                  onFilesChange={(files) => {
                    // Handle file changes - could sync back to chat
                    console.log("Files changed:", files);
                  }}
                  onRun={(files) => {
                    // Handle code execution
                    console.log("Running code:", files);
                  }}
                  onDeploy={(files) => {
                    handleDeployment(files);
                  }}
                  height="100%"
                />
              </div>
            ) : (
              <StickToBottom
                className="relative grow overflow-hidden"
                resize="smooth"
                initial={streamAppIsGenerating ? "smooth" : false}
              >
                <StickToBottom.Content>
                  <SyntaxHighlighter code={code} language={language} />
                </StickToBottom.Content>
              </StickToBottom>
            )
          ) : activeTab === "preview" ? (
            <>
              {language && (
                <div className="flex h-full items-center justify-center">
                  {useEnhancedRunner ? (
                    <EnhancedCodeRunner
                      initialCode={code}
                      language={language}
                      framework={codeCapabilities.framework}
                      metadata={codeCapabilities}
                      onCodeChange={() => {}}
                      onDeploy={handleDeployment}
                      key={refresh}
                    />
                  ) : (
                    <CodeRunner
                      onRequestFix={onRequestFix}
                      language={language}
                      code={code}
                      key={refresh}
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <DeploymentPipeline
                projectFiles={{}}
                projectName={projectName}
                metadata={codeCapabilities}
                onDeploymentComplete={(url, details) => {
                  console.log('Deployment completed:', url, details);
                  setDeploymentStatus("deployed");
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex grow flex-col bg-white">
          <div className="h-1/2 overflow-y-auto">
            {useCodeEditor ? (
              <CodeEditorWorkspace
                initialFiles={editorFiles}
                onFilesChange={(files) => {
                  console.log("Files changed:", files);
                }}
                onRun={(files) => {
                  console.log("Running code:", files);
                }}
                onDeploy={(files) => {
                  handleDeployment(files);
                }}
                height="100%"
              />
            ) : (
              <SyntaxHighlighter code={code} language={language} />
            )}
          </div>
          <div className="flex h-1/2 flex-col">
            <div className="border-t border-gray-300 px-4 py-4 flex items-center justify-between">
              <span>Output</span>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={useEnhancedRunner}
                  onChange={(e) => setUseEnhancedRunner(e.target.checked)}
                  className="rounded"
                />
                Enhanced Mode
              </label>
            </div>
            <div className="flex grow items-center justify-center border-t">
              {!streamAppIsGenerating && (
                useEnhancedRunner ? (
                  <EnhancedCodeRunner
                    initialCode={code}
                    language={language}
                    framework={codeCapabilities.framework}
                    metadata={codeCapabilities}
                    onCodeChange={() => {}}
                    onDeploy={handleDeployment}
                    key={refresh}
                  />
                ) : (
                  <CodeRunner
                    onRequestFix={onRequestFix}
                    language={language}
                    code={code}
                    key={refresh}
                  />
                )
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-300 px-4 py-4">
        <div className="inline-flex items-center gap-2.5 text-sm">
          <Share message={message && !streamApp ? message : undefined} />
          <button
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-sm text-gray-600 transition enabled:hover:bg-white disabled:opacity-50"
            onClick={() => setRefresh((r) => r + 1)}
          >
            <RefreshIcon className="size-3" />
            Refresh
          </button>
        </div>
        <div className="flex items-center justify-end gap-3">
          {previousMessage ? (
            <button
              className="text-gray-900"
              onClick={() => onMessageChange(previousMessage)}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
          ) : (
            <button className="text-gray-900 opacity-25" disabled>
              <ChevronLeftIcon className="size-4" />
            </button>
          )}

          <p className="text-sm">
            Version <span className="tabular-nums">{currentVersion + 1}</span>{" "}
            <span className="text-gray-400">of</span>{" "}
            <span className="tabular-nums">
              {Math.max(currentVersion + 1, assistantMessages.length)}
            </span>
          </p>

          {nextMessage ? (
            <button
              className="text-gray-900"
              onClick={() => onMessageChange(nextMessage)}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          ) : (
            <button className="text-gray-900 opacity-25" disabled>
              <ChevronRightIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
