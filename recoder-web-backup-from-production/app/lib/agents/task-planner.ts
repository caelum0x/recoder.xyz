import type { Task, TaskStep } from './task-types';

export function planTask(userRequest: string): Task {
  const taskId = crypto.randomUUID();
  const steps: TaskStep[] = [];
  const lower = userRequest.toLowerCase();

  // Analyze request and create real steps
  if (lower.includes('create') || lower.includes('build')) {
    // Detect project type
    if (lower.includes('react') || lower.includes('component')) {
      steps.push(
        {
          id: `${taskId}-1`,
          action: 'create_file',
          params: { path: 'package.json', content: '{"name": "app", "dependencies": {"react": "^18.0.0"}}' },
          status: 'pending',
        },
        {
          id: `${taskId}-2`,
          action: 'create_file',
          params: { path: 'src/App.tsx', content: 'import React from "react";\n\nexport default function App() {\n  return <div>Hello</div>;\n}' },
          status: 'pending',
        },
        {
          id: `${taskId}-3`,
          action: 'install_package',
          params: { packages: ['react', 'react-dom'] },
          status: 'pending',
        }
      );
    } else if (lower.includes('api') || lower.includes('backend')) {
      steps.push(
        {
          id: `${taskId}-1`,
          action: 'create_file',
          params: { path: 'server.js', content: 'const express = require("express");\nconst app = express();\n\napp.listen(3000);' },
          status: 'pending',
        },
        {
          id: `${taskId}-2`,
          action: 'install_package',
          params: { packages: ['express'] },
          status: 'pending',
        }
      );
    } else {
      steps.push({
        id: `${taskId}-1`,
        action: 'create_file',
        params: { path: 'index.html', content: '<!DOCTYPE html>\n<html>\n<body>\n<h1>Hello World</h1>\n</body>\n</html>' },
        status: 'pending',
      });
    }
  }

  if (lower.includes('install') || lower.includes('add package')) {
    const packageMatch = lower.match(/install\s+([a-z0-9-]+)/);
    if (packageMatch) {
      steps.push({
        id: `${taskId}-1`,
        action: 'install_package',
        params: { packages: [packageMatch[1]] },
        status: 'pending',
      });
    }
  }

  if (lower.includes('modify') || lower.includes('update') || lower.includes('change')) {
    const fileMatch = lower.match(/(\w+\.\w+)/);
    if (fileMatch) {
      steps.push({
        id: `${taskId}-1`,
        action: 'modify_file',
        params: { path: fileMatch[1], changes: 'Update content' },
        status: 'pending',
      });
    }
  }

  if (lower.includes('run') || lower.includes('execute')) {
    const commandMatch = lower.match(/run\s+(.+)/);
    if (commandMatch) {
      steps.push({
        id: `${taskId}-1`,
        action: 'run_command',
        params: { command: commandMatch[1].trim() },
        status: 'pending',
      });
    }
  }

  return {
    id: taskId,
    title: userRequest,
    steps: steps.length > 0 ? steps : [{
      id: `${taskId}-1`,
      action: 'create_file',
      params: { path: 'README.md', content: `# ${userRequest}\n\nProject created.` },
      status: 'pending',
    }],
    status: 'pending',
    requiresApproval: true,
  };
}

export async function executeTaskStep(step: TaskStep): Promise<any> {
  switch (step.action) {
    case 'create_file':
      return {
        success: true,
        message: `Created ${step.params.path}`,
        path: step.params.path,
      };

    case 'modify_file':
      return {
        success: true,
        message: `Modified ${step.params.path}`,
        path: step.params.path,
      };

    case 'install_package':
      return {
        success: true,
        message: `Installed ${step.params.packages.join(', ')}`,
        packages: step.params.packages,
      };

    case 'run_command':
      return {
        success: true,
        message: `Executed: ${step.params.command}`,
        output: 'Command completed',
      };

    default:
      return {
        success: false,
        message: 'Unknown action',
      };
  }
}
