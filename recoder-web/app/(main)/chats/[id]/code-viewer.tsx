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
  const language = streamApp ? streamApp.language : app?.language || "text";
  const title = streamApp ? (streamApp.filename?.name || 'Unnamed') : (app?.filename?.name || 'Unnamed');
  const layout = ["python", "ts", "js", "javascript", "typescript"].includes(
    language || '',
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
    const isReactApp = /react|jsx|tsx|component/i.test(codeContent) || (language && language.includes('react'));
    
    return {
      hasDatabase,
      hasAPI,
      hasAuth,
      realFunctionality: hasDatabase || hasAPI || hasAuth,
      framework: isReactApp ? 'react' : language === 'javascript' ? 'vanilla' : 'react'
    };
  };

  const codeCapabilities = analyzeCodeCapabilities(code);
  const projectName = title || `${(chat.title || "untitled").slice(0, 20)}-v${currentVersion + 1}`;

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

  const editorFiles = createFileStructure(code, title, language || 'text');

  return (
    <>
      {/* Enhanced Professional Code Viewer Header */}
      <div className="flex h-20 shrink-0 items-center justify-between border-b border-gray-200/50 px-6 bg-gradient-to-r from-gray-50/80 to-blue-50/80 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <button
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/80 text-gray-400 hover:text-gray-700 hover:bg-white shadow-sm transition-all duration-200 hover:scale-105"
            onClick={onClose}
          >
            <CloseIcon className="size-5" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-gradient-to-br from-green-500 to-blue-600 rounded-full animate-pulse" />
              <div>
                <h3 className="font-bold text-gray-900 text-lg">
                  {title || 'Generated Code'}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Version {currentVersion + 1}</span>
                  <span className="w-1 h-1 bg-gray-400 rounded-full" />
                  <span className="capitalize">{language || 'code'}</span>
                  {codeCapabilities.realFunctionality && (
                    <>
                      <span className="w-1 h-1 bg-gray-400 rounded-full" />
                      <span className="flex items-center gap-1 text-green-600 font-medium">
                        <span>⚡</span>
                        Production Ready
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-3 text-sm bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-sm ring-1 ring-gray-200/50 transition-all hover:shadow-md group">
              <input
                type="checkbox"
                checked={useCodeEditor}
                onChange={(e) => setUseCodeEditor(e.target.checked)}
                className="w-4 h-4 rounded border-2 border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
              />
              <span className="font-medium text-gray-700 group-hover:text-blue-700 transition-colors">
                🎨 Enhanced Editor
              </span>
              {useCodeEditor && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">ON</span>
              )}
            </label>
            
            {/* Code Quality Indicators */}
            <div className="flex items-center gap-2">
              {codeCapabilities.hasDatabase && (
                <div className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                  <span>🗄️</span>
                  <span>Database</span>
                </div>
              )}
              {codeCapabilities.hasAPI && (
                <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                  <span>🌐</span>
                  <span>API</span>
                </div>
              )}
              {codeCapabilities.hasAuth && (
                <div className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                  <span>🔒</span>
                  <span>Auth</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {layout === "tabbed" && (
          <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-2xl p-1.5 shadow-lg ring-1 ring-gray-200/50">
            <button
              onClick={() => onTabChange("code")}
              data-active={activeTab === "code" ? true : undefined}
              className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-semibold transition-all duration-200 data-[active]:bg-gradient-to-r data-[active]:from-blue-600 data-[active]:to-purple-600 data-[active]:text-white data-[active]:shadow-lg hover:bg-gray-100 data-[active]:hover:from-blue-700 data-[active]:hover:to-purple-700"
            >
              <span>💻</span>
              <span>Code</span>
            </button>
            <button
              onClick={() => onTabChange("preview")}
              data-active={activeTab === "preview" ? true : undefined}
              className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-semibold transition-all duration-200 data-[active]:bg-gradient-to-r data-[active]:from-green-600 data-[active]:to-blue-600 data-[active]:text-white data-[active]:shadow-lg hover:bg-gray-100 data-[active]:hover:from-green-700 data-[active]:hover:to-blue-700"
            >
              <span>👁️</span>
              <span>Preview</span>
            </button>
            <button
              onClick={() => onTabChange("deploy")}
              data-active={activeTab === "deploy" ? true : undefined}
              className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-semibold transition-all duration-200 data-[active]:bg-gradient-to-r data-[active]:from-purple-600 data-[active]:to-pink-600 data-[active]:text-white data-[active]:shadow-lg hover:bg-gray-100 data-[active]:hover:from-purple-700 data-[active]:hover:to-pink-700"
            >
              <span>🚀</span>
              <span>Deploy</span>
              {deploymentStatus === "deployed" && (
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              )}
              {deploymentStatus === "deploying" && (
                <div className="w-2 h-2 border border-white/50 border-t-white rounded-full animate-spin" />
              )}
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
                  <SyntaxHighlighter code={code} language={language || 'text'} />
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
              <SyntaxHighlighter code={code} language={language || 'text'} />
            )}
          </div>
          <div className="flex h-1/2 flex-col">
            <div className="border-t border-gray-200/50 px-6 py-4 flex items-center justify-between bg-gradient-to-r from-gray-50/60 to-green-50/60 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-gradient-to-br from-green-500 to-blue-600 rounded-full animate-pulse" />
                <span className="font-bold text-gray-900 text-lg">Live Output</span>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1 h-1 bg-gray-400 rounded-full" />
                  <span>Real-time preview</span>
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-sm ring-1 ring-gray-200/50 transition-all hover:shadow-md group">
                <input
                  type="checkbox"
                  checked={useEnhancedRunner}
                  onChange={(e) => setUseEnhancedRunner(e.target.checked)}
                  className="w-4 h-4 rounded border-2 border-gray-300 text-green-600 focus:ring-green-500 focus:ring-2"
                />
                <span className="font-medium text-gray-700 group-hover:text-green-700 transition-colors">
                  ⚡ Enhanced Mode
                </span>
                {useEnhancedRunner && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">ON</span>
                )}
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
                    language={language || 'text'}
                    code={code}
                    key={refresh}
                  />
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Professional Footer */}
      <div className="flex items-center justify-between border-t border-gray-200/50 px-6 py-5 bg-gradient-to-r from-gray-50/80 to-blue-50/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Share message={message && !streamApp ? message : undefined} />
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-white/90 backdrop-blur-sm border border-gray-200/50 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200/50 transition-all duration-200 hover:bg-white hover:shadow-md hover:scale-105 enabled:hover:text-blue-700 disabled:opacity-50"
            onClick={() => setRefresh((r) => r + 1)}
          >
            <RefreshIcon className="size-4" />
            <span>Refresh Output</span>
          </button>
          
          {/* Performance Metrics */}
          <div className="hidden md:flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/60 rounded-lg">
              <span>📊</span>
              <span className="font-medium text-gray-600">Lines: </span>
              <span className="font-bold text-gray-900 tabular-nums">{code.split('\n').length}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-white/60 rounded-lg">
              <span>⚡</span>
              <span className="font-medium text-gray-600">Size: </span>
              <span className="font-bold text-gray-900 tabular-nums">{(code.length / 1024).toFixed(1)}KB</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-white/60 rounded-lg">
              <span className={`${codeCapabilities.realFunctionality ? 'text-green-600' : 'text-gray-400'}`}>
                {codeCapabilities.realFunctionality ? '🟢' : '🟡'}
              </span>
              <span className="font-medium text-gray-600">Status: </span>
              <span className={`font-bold tabular-nums ${
                codeCapabilities.realFunctionality ? 'text-green-700' : 'text-orange-700'
              }`}>
                {codeCapabilities.realFunctionality ? 'Production' : 'Demo'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Enhanced Version Navigation */}
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-xl p-1 shadow-sm ring-1 ring-gray-200/50">
            <button
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${
                previousMessage 
                  ? 'text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:scale-110' 
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              onClick={() => previousMessage && onMessageChange(previousMessage)}
              disabled={!previousMessage}
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            
            <div className="px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-600">Version</span>
                <span className="font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-lg tabular-nums">
                  {currentVersion + 1}
                </span>
                <span className="text-gray-400 font-medium">of</span>
                <span className="font-bold text-gray-700 tabular-nums">
                  {Math.max(currentVersion + 1, assistantMessages.length)}
                </span>
              </div>
            </div>
            
            <button
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${
                nextMessage 
                  ? 'text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:scale-110' 
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              onClick={() => nextMessage && onMessageChange(nextMessage)}
              disabled={!nextMessage}
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </div>
          
          {/* Deployment Status Badge */}
          {deploymentStatus !== "idle" && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm ${
              deploymentStatus === "deployed" 
                ? 'bg-green-100 text-green-700 ring-1 ring-green-200'
                : 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
            }`}>
              {deploymentStatus === "deployed" ? (
                <>
                  <span>✅</span>
                  <span className="font-semibold">Deployed</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="font-semibold">Deploying...</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
