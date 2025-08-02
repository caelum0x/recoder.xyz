"use client";

import { useState, useEffect, useRef } from "react";
import MonacoEditor from "./monaco-editor";
import FileTree, { FileNode } from "./file-tree";
import {
  PanelLeftClose,
  PanelLeft,
  Terminal,
  X,
  Maximize2,
  Minimize2,
  Play,
  Square,
  RefreshCw,
  Download,
  Share2,
  Settings,
  Code2,
} from "lucide-react";

interface CodeEditorWorkspaceProps {
  initialFiles?: FileNode[];
  onFilesChange?: (files: FileNode[]) => void;
  onRun?: (files: FileNode[]) => void;
  onDeploy?: (files: FileNode[]) => void;
  className?: string;
  height?: string;
}

export default function CodeEditorWorkspace({
  initialFiles = [],
  onFilesChange,
  onRun,
  onDeploy,
  className = "",
  height = "600px",
}: CodeEditorWorkspaceProps) {
  const [files, setFiles] = useState<FileNode[]>(initialFiles);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [isTreeVisible, setIsTreeVisible] = useState(true);
  const [isTerminalVisible, setIsTerminalVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const workspaceRef = useRef<HTMLDivElement>(null);

  // Generate unique ID for new files
  const generateId = () => `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Initialize with default files if none provided
  useEffect(() => {
    if (initialFiles.length === 0) {
      const defaultFiles: FileNode[] = [
        {
          id: "app-tsx",
          name: "App.tsx",
          type: "file",
          language: "typescript",
          content: `import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Hello, Recoder!
        </h1>
        <p className="text-gray-600">
          Welcome to your AI-powered development workspace.
        </p>
      </div>
    </div>
  );
}

export default App;`,
        },
        {
          id: "package-json",
          name: "package.json",
          type: "file",
          language: "json",
          content: `{
  "name": "recoder-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "vite preview"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}`,
        },
      ];
      setFiles(defaultFiles);
      setSelectedFile(defaultFiles[0]);
    } else {
      setFiles(initialFiles);
      if (initialFiles.length > 0) {
        setSelectedFile(initialFiles[0]);
      }
    }
  }, [initialFiles]);

  // Notify parent of file changes
  useEffect(() => {
    onFilesChange?.(files);
  }, [files, onFilesChange]);

  const updateFileContent = (content: string) => {
    if (!selectedFile) return;

    const updateFilesRecursively = (files: FileNode[]): FileNode[] => {
      return files.map(file => {
        if (file.id === selectedFile.id) {
          return { ...file, content };
        }
        if (file.children) {
          return { ...file, children: updateFilesRecursively(file.children) };
        }
        return file;
      });
    };

    const updatedFiles = updateFilesRecursively(files);
    setFiles(updatedFiles);
    setSelectedFile({ ...selectedFile, content });
  };

  const createFile = (parentId: string | null, type: "file" | "folder", name: string) => {
    const newFile: FileNode = {
      id: generateId(),
      name,
      type,
      content: type === "file" ? "" : undefined,
      children: type === "folder" ? [] : undefined,
      parent: parentId,
    };

    if (parentId) {
      // Add to specific parent folder
      const addToParent = (files: FileNode[]): FileNode[] => {
        return files.map(file => {
          if (file.id === parentId && file.type === "folder") {
            return {
              ...file,
              children: [...(file.children || []), newFile],
            };
          }
          if (file.children) {
            return { ...file, children: addToParent(file.children) };
          }
          return file;
        });
      };
      setFiles(addToParent(files));
    } else {
      // Add to root
      setFiles([...files, newFile]);
    }

    if (type === "file") {
      setSelectedFile(newFile);
    }
  };

  const deleteFile = (fileId: string) => {
    const removeFileRecursively = (files: FileNode[]): FileNode[] => {
      return files.filter(file => {
        if (file.id === fileId) {
          return false;
        }
        if (file.children) {
          file.children = removeFileRecursively(file.children);
        }
        return true;
      });
    };

    setFiles(removeFileRecursively(files));
    
    if (selectedFile?.id === fileId) {
      const remainingFiles = files.filter(f => f.id !== fileId);
      setSelectedFile(remainingFiles.length > 0 ? remainingFiles[0] : null);
    }
  };

  const renameFile = (fileId: string, newName: string) => {
    const renameFileRecursively = (files: FileNode[]): FileNode[] => {
      return files.map(file => {
        if (file.id === fileId) {
          return { ...file, name: newName };
        }
        if (file.children) {
          return { ...file, children: renameFileRecursively(file.children) };
        }
        return file;
      });
    };

    setFiles(renameFileRecursively(files));
    
    if (selectedFile?.id === fileId) {
      setSelectedFile({ ...selectedFile, name: newName });
    }
  };

  const moveFile = (fileId: string, newParentId: string | null) => {
    // TODO: Implement file moving logic
    console.log("Move file", fileId, "to", newParentId);
  };

  const runCode = async () => {
    if (!onRun) return;
    
    setIsRunning(true);
    setIsTerminalVisible(true);
    setTerminalOutput(["🚀 Running code...", ""]);
    
    try {
      await onRun(files);
      setTerminalOutput(prev => [...prev, "✅ Code executed successfully!"]);
    } catch (error) {
      setTerminalOutput(prev => [...prev, `❌ Error: ${error}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const deployApp = async () => {
    if (!onDeploy) return;
    
    setIsRunning(true);
    setIsTerminalVisible(true);
    setTerminalOutput(["🚀 Deploying application...", ""]);
    
    try {
      await onDeploy(files);
      setTerminalOutput(prev => [...prev, "✅ Application deployed successfully!"]);
    } catch (error) {
      setTerminalOutput(prev => [...prev, `❌ Deployment error: ${error}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const downloadProject = () => {
    const createZip = async () => {
      // Simple text-based "zip" - in production, use JSZip
      const fileContents = files.map(file => 
        `// ${file.name}\n${file.content || ""}\n\n`
      ).join("\n" + "=".repeat(50) + "\n");
      
      const blob = new Blob([fileContents], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "recoder-project.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    createZip();
  };

  const getLanguageFromFileName = (fileName: string): string => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "html":
        return "html";
      case "css":
        return "css";
      case "scss":
      case "sass":
        return "scss";
      case "json":
        return "json";
      case "md":
        return "markdown";
      case "py":
        return "python";
      case "sql":
        return "sql";
      default:
        return "plaintext";
    }
  };

  return (
    <div
      ref={workspaceRef}
      className={`flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-50" : ""
      } ${className}`}
      style={{ height: isFullscreen ? "100vh" : height }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-gray-900">Code Editor</span>
          </div>
          
          <div className="w-px h-6 bg-gray-300" />
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsTreeVisible(!isTreeVisible)}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Toggle File Tree"
            >
              {isTreeVisible ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
            
            <button
              onClick={() => setIsTerminalVisible(!isTerminalVisible)}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Toggle Terminal"
            >
              <Terminal className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRun && (
            <button
              onClick={runCode}
              disabled={isRunning}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run
            </button>
          )}
          
          {onDeploy && (
            <button
              onClick={deployApp}
              disabled={isRunning}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Share2 className="w-3 h-3" />
              Deploy
            </button>
          )}
          
          <button
            onClick={downloadProject}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
            title="Download Project"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree */}
        {isTreeVisible && (
          <div className="w-64 flex-shrink-0">
            <FileTree
              files={files}
              onFileSelect={setSelectedFile}
              onFileCreate={createFile}
              onFileDelete={deleteFile}
              onFileRename={renameFile}
              onFileMove={moveFile}
              selectedFileId={selectedFile?.id}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 flex flex-col">
          {selectedFile ? (
            <MonacoEditor
              value={selectedFile.content || ""}
              onChange={updateFileContent}
              language={getLanguageFromFileName(selectedFile.name)}
              fileName={selectedFile.name}
              height={isTerminalVisible ? "70%" : "100%"}
              showToolbar={false}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Code2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">No file selected</p>
                <p className="text-sm">Select a file from the tree or create a new one</p>
              </div>
            </div>
          )}

          {/* Terminal */}
          {isTerminalVisible && (
            <div className="h-32 border-t border-gray-200 bg-gray-900 text-white">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <span className="text-sm font-medium">Terminal</span>
                <button
                  onClick={() => setIsTerminalVisible(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 font-mono text-sm overflow-auto max-h-24">
                {terminalOutput.map((line, index) => (
                  <div key={index} className="mb-1">
                    {line}
                  </div>
                ))}
                {isRunning && (
                  <div className="flex items-center gap-2 text-yellow-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Processing...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}