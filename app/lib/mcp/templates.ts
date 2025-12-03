import type { MCPServerConfig } from './client';

export interface MCPServerTemplate {
  id: string;
  name: string;
  description: string;
  servers: string[]; // Server IDs from registry
  category: 'development' | 'productivity' | 'research' | 'custom';
  icon?: string;
}

export const SERVER_TEMPLATES: MCPServerTemplate[] = [
  {
    id: 'full-stack-dev',
    name: 'Full-Stack Development',
    description: 'Complete setup for full-stack development with Git, filesystem, and GitHub',
    servers: ['git', 'filesystem', 'recoder-github'],
    category: 'development',
    icon: '💻',
  },
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Tools for research with web fetch, memory, and sequential thinking',
    servers: ['fetch', 'memory', 'sequential-thinking'],
    category: 'research',
    icon: '🔬',
  },
  {
    id: 'productivity-suite',
    name: 'Productivity Suite',
    description: 'Boost productivity with memory, time, and filesystem tools',
    servers: ['memory', 'time', 'filesystem'],
    category: 'productivity',
    icon: '⚡',
  },
  {
    id: 'minimal-setup',
    name: 'Minimal Setup',
    description: 'Essential tools: filesystem and memory',
    servers: ['filesystem', 'memory'],
    category: 'development',
    icon: '🎯',
  },
];

export function getTemplateById(id: string): MCPServerTemplate | undefined {
  return SERVER_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: MCPServerTemplate['category']): MCPServerTemplate[] {
  return SERVER_TEMPLATES.filter((t) => t.category === category);
}

export async function applyTemplate(
  userId: string,
  templateId: string,
  installServer: (userId: string, serverId: string) => Promise<any>
): Promise<{ installed: string[]; failed: string[] }> {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  const installed: string[] = [];
  const failed: string[] = [];

  for (const serverId of template.servers) {
    try {
      await installServer(userId, serverId);
      installed.push(serverId);
    } catch (error) {
      console.error(`Failed to install ${serverId}:`, error);
      failed.push(serverId);
    }
  }

  return { installed, failed };
}
