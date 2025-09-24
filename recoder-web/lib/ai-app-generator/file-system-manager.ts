/**
 * File System Manager for AI App Generator
 * Handles file operations, project structure, and code management
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
  isOpen?: boolean;
  isActive?: boolean;
}

interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
}

interface ApplyChangesOptions {
  currentFiles: FileNode[];
  changes: FileChange[];
  sessionId: string;
}

interface UpdateDependenciesOptions {
  files: FileNode[];
  dependencies: string[];
  sessionId: string;
}

class FileSystemManager {
  private readonly projectsDir: string;

  constructor() {
    this.projectsDir = path.join(process.cwd(), 'tmp', 'ai-projects');
  }

  /**
   * Apply file changes to the project structure
   */
  async applyChanges(options: ApplyChangesOptions): Promise<FileNode[]> {
    const { currentFiles, changes, sessionId } = options;
    let updatedFiles = [...currentFiles];

    for (const change of changes) {
      switch (change.action) {
        case 'create':
        case 'update':
          updatedFiles = await this.upsertFile(updatedFiles, change.path, change.content);
          break;
        case 'delete':
          updatedFiles = await this.deleteFile(updatedFiles, change.path);
          break;
      }
    }

    // Save to disk for preview generation
    await this.saveProjectToDisk(updatedFiles, sessionId);

    return updatedFiles;
  }

  /**
   * Create or update a file in the project structure
   */
  private async upsertFile(files: FileNode[], filePath: string, content: string): Promise<FileNode[]> {
    const pathParts = filePath.split('/');
    const fileName = pathParts.pop()!;
    const folderPath = pathParts;

    // Find or create the target folder
    let currentLevel = files;
    let targetFolder: FileNode | null = null;

    // Navigate through folder structure
    for (const folderName of folderPath) {
      let folder = currentLevel.find(f => f.name === folderName && f.type === 'folder');
      
      if (!folder) {
        // Create missing folder
        folder = {
          id: uuidv4(),
          name: folderName,
          type: 'folder',
          children: [],
          isOpen: true
        };
        currentLevel.push(folder);
      }
      
      currentLevel = folder.children!;
      targetFolder = folder;
    }

    // Find existing file or create new one
    const existingFileIndex = currentLevel.findIndex(f => f.name === fileName && f.type === 'file');
    const language = this.getLanguageFromExtension(fileName);

    const fileNode: FileNode = {
      id: existingFileIndex >= 0 ? currentLevel[existingFileIndex].id : uuidv4(),
      name: fileName,
      type: 'file',
      content,
      language,
      isActive: false
    };

    if (existingFileIndex >= 0) {
      currentLevel[existingFileIndex] = fileNode;
    } else {
      currentLevel.push(fileNode);
    }

    return files;
  }

  /**
   * Delete a file from the project structure
   */
  private async deleteFile(files: FileNode[], filePath: string): Promise<FileNode[]> {
    const pathParts = filePath.split('/');
    const fileName = pathParts.pop()!;
    const folderPath = pathParts;

    let currentLevel = files;

    // Navigate to the target folder
    for (const folderName of folderPath) {
      const folder = currentLevel.find(f => f.name === folderName && f.type === 'folder');
      if (!folder || !folder.children) return files;
      currentLevel = folder.children;
    }

    // Remove the file
    const fileIndex = currentLevel.findIndex(f => f.name === fileName);
    if (fileIndex >= 0) {
      currentLevel.splice(fileIndex, 1);
    }

    return files;
  }

  /**
   * Update project dependencies
   */
  async updateDependencies(options: UpdateDependenciesOptions): Promise<FileNode[]> {
    const { files, dependencies, sessionId } = options;
    
    // Find package.json
    const packageJsonFile = this.findFile(files, 'package.json');
    
    if (packageJsonFile && packageJsonFile.content) {
      try {
        const packageJson = JSON.parse(packageJsonFile.content);
        
        // Add new dependencies
        if (!packageJson.dependencies) {
          packageJson.dependencies = {};
        }

        for (const dep of dependencies) {
          const [name, version] = dep.includes('@') ? dep.split('@') : [dep, 'latest'];
          packageJson.dependencies[name] = version;
        }

        // Update the file content
        packageJsonFile.content = JSON.stringify(packageJson, null, 2);
        
        // Save to disk
        await this.saveProjectToDisk(files, sessionId);
      } catch (error) {
        console.error('Failed to update dependencies:', error);
      }
    }

    return files;
  }

  /**
   * Save project files to disk for preview generation
   */
  async saveProjectToDisk(files: FileNode[], sessionId: string): Promise<string> {
    const projectPath = path.join(this.projectsDir, sessionId);
    
    try {
      // Ensure project directory exists
      await fs.mkdir(projectPath, { recursive: true });
      
      // Save all files
      await this.saveFilesToDisk(files, projectPath);
      
      return projectPath;
    } catch (error) {
      console.error('Failed to save project to disk:', error);
      throw error;
    }
  }

  /**
   * Recursively save files to disk
   */
  private async saveFilesToDisk(files: FileNode[], basePath: string): Promise<void> {
    for (const file of files) {
      const filePath = path.join(basePath, file.name);
      
      if (file.type === 'folder' && file.children) {
        await fs.mkdir(filePath, { recursive: true });
        await this.saveFilesToDisk(file.children, filePath);
      } else if (file.type === 'file' && file.content) {
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
    }
  }

  /**
   * Find a file by name in the project structure
   */
  private findFile(files: FileNode[], fileName: string): FileNode | null {
    for (const file of files) {
      if (file.type === 'file' && file.name === fileName) {
        return file;
      }
      if (file.type === 'folder' && file.children) {
        const found = this.findFile(file.children, fileName);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Get programming language from file extension
   */
  private getLanguageFromExtension(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.sql': 'sql',
      '.sh': 'shell',
      '.bash': 'shell',
      '.zsh': 'shell',
      '.fish': 'shell'
    };

    return languageMap[ext] || 'text';
  }

  /**
   * Create default project structure for different frameworks
   */
  createDefaultProject(framework: string): FileNode[] {
    switch (framework) {
      case 'react':
        return this.createReactProject();
      case 'next':
        return this.createNextProject();
      case 'vue':
        return this.createVueProject();
      case 'angular':
        return this.createAngularProject();
      case 'svelte':
        return this.createSvelteProject();
      case 'express':
        return this.createExpressProject();
      default:
        return this.createReactProject();
    }
  }

  /**
   * Create React project structure
   */
  private createReactProject(): FileNode[] {
    return [
      {
        id: 'src',
        name: 'src',
        type: 'folder',
        isOpen: true,
        children: [
          {
            id: 'app.tsx',
            name: 'App.tsx',
            type: 'file',
            language: 'typescript',
            isActive: true,
            content: `import React, { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to your AI-generated React app!</h1>
        <div className="counter">
          <button onClick={() => setCount(count - 1)}>-</button>
          <span>{count}</span>
          <button onClick={() => setCount(count + 1)}>+</button>
        </div>
        <p>Tell me what you want to build and I'll help you create it!</p>
      </header>
    </div>
  );
}

export default App;`
          },
          {
            id: 'app.css',
            name: 'App.css',
            type: 'file',
            language: 'css',
            content: `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.App-header h1 {
  margin-bottom: 20px;
  color: #61dafb;
}

.counter {
  margin: 20px 0;
  display: flex;
  align-items: center;
  gap: 15px;
}

.counter button {
  padding: 10px 20px;
  font-size: 18px;
  background-color: #61dafb;
  color: #282c34;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.counter button:hover {
  background-color: #4fa8c5;
}

.counter span {
  font-size: 24px;
  font-weight: bold;
  min-width: 40px;
}`
          },
          {
            id: 'index.tsx',
            name: 'index.tsx',
            type: 'file',
            language: 'typescript',
            content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
          }
        ]
      },
      {
        id: 'public',
        name: 'public',
        type: 'folder',
        isOpen: false,
        children: [
          {
            id: 'index.html',
            name: 'index.html',
            type: 'file',
            language: 'html',
            content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="AI-generated React application" />
    <title>AI Generated App</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`
          }
        ]
      },
      {
        id: 'package.json',
        name: 'package.json',
        type: 'file',
        language: 'json',
        content: `{
  "name": "ai-generated-react-app",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^4.9.5",
    "web-vitals": "^3.3.2"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  }
}`
      }
    ];
  }

  /**
   * Create Next.js project structure
   */
  private createNextProject(): FileNode[] {
    return [
      {
        id: 'app',
        name: 'app',
        type: 'folder',
        isOpen: true,
        children: [
          {
            id: 'layout.tsx',
            name: 'layout.tsx',
            type: 'file',
            language: 'typescript',
            content: `import './globals.css'

export const metadata = {
  title: 'AI Generated Next.js App',
  description: 'Created with AI assistance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}`
          },
          {
            id: 'page.tsx',
            name: 'page.tsx',
            type: 'file',
            language: 'typescript',
            isActive: true,
            content: `'use client';

import { useState } from 'react';

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <main className="container">
      <h1>Welcome to your AI-generated Next.js app!</h1>
      <div className="counter">
        <button onClick={() => setCount(count - 1)}>-</button>
        <span>{count}</span>
        <button onClick={() => setCount(count + 1)}>+</button>
      </div>
      <p>Tell me what you want to build and I'll help you create it!</p>
    </main>
  );
}`
          },
          {
            id: 'globals.css',
            name: 'globals.css',
            type: 'file',
            language: 'css',
            content: `* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  color: #333;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  color: white;
}

.container h1 {
  font-size: 2.5rem;
  margin-bottom: 2rem;
}

.counter {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 2rem 0;
}

.counter button {
  padding: 0.5rem 1rem;
  font-size: 1.2rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.counter button:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.counter span {
  font-size: 1.5rem;
  font-weight: bold;
  min-width: 40px;
}`
          }
        ]
      },
      {
        id: 'package.json',
        name: 'package.json',
        type: 'file',
        language: 'json',
        content: `{
  "name": "ai-generated-nextjs-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.4.5"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "14.2.3"
  }
}`
      }
    ];
  }

  /**
   * Create Vue.js project structure
   */
  private createVueProject(): FileNode[] {
    // Implementation for Vue.js project structure
    return [];
  }

  /**
   * Create Angular project structure
   */
  private createAngularProject(): FileNode[] {
    // Implementation for Angular project structure
    return [];
  }

  /**
   * Create Svelte project structure
   */
  private createSvelteProject(): FileNode[] {
    // Implementation for Svelte project structure
    return [];
  }

  /**
   * Create Express.js project structure
   */
  private createExpressProject(): FileNode[] {
    // Implementation for Express.js project structure
    return [];
  }

  /**
   * Clean up old project files
   */
  async cleanupOldProjects(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(this.projectsDir, entry.name);
          const stats = await fs.stat(projectPath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.rm(projectPath, { recursive: true, force: true });
            console.log(`Cleaned up old project: ${entry.name}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old projects:', error);
    }
  }
}

export const fileSystemManager = new FileSystemManager();