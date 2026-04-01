import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  GitBranch,
  Layers,
  Layout,
  Lightbulb,
  Route,
  Sparkles,
  Workflow,
} from 'lucide-react';

export interface CanvasSamplePrompt {
  text: string;
  thumbnail?: string;
}

export interface CanvasActionDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
  aliases?: string[];
}

export interface CanvasStarterTemplate {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  prompt: string;
}

export interface CanvasStarterCategory {
  id: string;
  label: string;
  templates: CanvasStarterTemplate[];
}

export const canvasActionDefinitions: CanvasActionDefinition[] = [
  {
    id: 'board',
    name: 'Blank Board',
    description: 'Start a fresh whiteboard',
    icon: 'sparkles',
    aliases: ['create'],
    prompt:
      'Initialize the tools. Create a new Excalidraw board in `/workspace/canvases/` as a `.excalidraw` file. Use shapes, connectors, and labels instead of generating a raster image. Start the board with a clear title and a few seed elements for: [describe what you want to map].',
  },
  {
    id: 'diagram',
    name: 'Diagram',
    description: 'Architecture, systems, and maps',
    icon: 'shapes',
    aliases: ['edit'],
    prompt:
      'Initialize the tools. Create a diagram in a new `.excalidraw` board under `/workspace/canvases/`. Use labeled boxes, arrows, and grouped sections to explain: [describe the system or concept].',
  },
  {
    id: 'wireframe',
    name: 'Wireframe',
    description: 'Screens, layouts, and notes',
    icon: 'layers',
    aliases: ['upscale'],
    prompt:
      'Initialize the tools. Create a low-fidelity product wireframe in a new `.excalidraw` board under `/workspace/canvases/`. Use frames, annotations, and connectors to sketch: [describe the product or screen flow].',
  },
  {
    id: 'flowchart',
    name: 'Flowchart',
    description: 'Processes, journeys, and decisions',
    icon: 'clipboardList',
    aliases: ['remove-bg'],
    prompt:
      'Initialize the tools. Create a flowchart in a new `.excalidraw` board under `/workspace/canvases/`. Use start/end nodes, decision points, arrows, and short labels to map: [describe the process].',
  },
];

const canvasActionLookup = new Map<string, CanvasActionDefinition>(
  canvasActionDefinitions.flatMap((definition) => {
    const ids = [definition.id, ...(definition.aliases ?? [])];
    return ids.map((id) => [id, definition] as const);
  }),
);

export function normalizeCanvasActionId(actionId: string | null | undefined): string | null {
  if (!actionId) return null;
  return canvasActionLookup.get(actionId)?.id ?? actionId;
}

export function getCanvasActionDefinition(
  actionId: string | null | undefined,
): CanvasActionDefinition | undefined {
  if (!actionId) return undefined;
  return canvasActionLookup.get(actionId);
}

export function getCanvasActionName(actionId: string | null | undefined): string | null {
  return getCanvasActionDefinition(actionId)?.name ?? null;
}

export function getCanvasActionPrompt(actionId: string | null | undefined): string | null {
  return getCanvasActionDefinition(actionId)?.prompt ?? null;
}

export const canvasModeSamplePrompts: CanvasSamplePrompt[] = [
  {
    text: 'Map our onboarding funnel as an Excalidraw flowchart with drop-off points and owner notes',
    thumbnail: '/images/landing-showcase/docs.png',
  },
  {
    text: 'Sketch a mobile banking app wireframe in a new Excalidraw board with the core account screens',
    thumbnail: '/images/landing-showcase/data.png',
  },
  {
    text: 'Create a system architecture diagram for a multi-tenant SaaS stack with API, queue, and database layers',
    thumbnail: '/images/landing-showcase/research.png',
  },
  {
    text: 'Build a product strategy whiteboard showing themes, bets, and success metrics for the next quarter',
    thumbnail: '/images/landing-showcase/slides.png',
  },
  {
    text: 'Turn a support escalation process into an Excalidraw decision tree with SLA checkpoints',
    thumbnail: '/images/landing-showcase/docs.png',
  },
  {
    text: 'Draft a workshop whiteboard with goals, agenda, sticky-note clusters, and next actions',
    thumbnail: '/images/landing-showcase/research.png',
  },
];

export const canvasModeExamplePrompts = canvasModeSamplePrompts.map((prompt) => prompt.text).slice(0, 4);

export const canvasStarterCategories: CanvasStarterCategory[] = [
  {
    id: 'product',
    label: 'Product & UX',
    templates: [
      {
        id: 'user-flow',
        icon: Route,
        label: 'User Flow',
        description: 'Journey with screens and decisions',
        prompt:
          'Initialize the tools. Create a user journey in a new `.excalidraw` board under `/workspace/canvases/` for a user signing up, onboarding, and reaching first value. Use screens, arrows, branch points, and short callouts.',
      },
      {
        id: 'app-wireframe',
        icon: Layout,
        label: 'App Wireframe',
        description: 'Low-fidelity screens and layout',
        prompt:
          'Initialize the tools. Create a low-fidelity app wireframe in a new `.excalidraw` board under `/workspace/canvases/` for a finance dashboard. Include a sidebar, KPI cards, charts area, and recent activity panel with annotations.',
      },
      {
        id: 'whiteboard-brainstorm',
        icon: Lightbulb,
        label: 'Brainstorm Board',
        description: 'Ideas, clusters, and priorities',
        prompt:
          'Initialize the tools. Create a brainstorming whiteboard in a new `.excalidraw` board under `/workspace/canvases/` for planning a product launch. Include themed sections, sticky-note style idea clusters, and a prioritization area.',
      },
    ],
  },
  {
    id: 'systems',
    label: 'Systems & Architecture',
    templates: [
      {
        id: 'architecture',
        icon: Boxes,
        label: 'Architecture',
        description: 'Services, data stores, and flows',
        prompt:
          'Initialize the tools. Create a software architecture diagram in a new `.excalidraw` board under `/workspace/canvases/` showing web app, API, workers, queue, and database layers with directional data flow arrows.',
      },
      {
        id: 'integration-map',
        icon: Boxes,
        label: 'Integration Map',
        description: 'External systems and dependencies',
        prompt:
          'Initialize the tools. Create an integration map in a new `.excalidraw` board under `/workspace/canvases/` for CRM, billing, analytics, email, and support systems. Show ownership boundaries and sync directions.',
      },
      {
        id: 'process-flow',
        icon: Workflow,
        label: 'Process Flow',
        description: 'Operations and handoffs',
        prompt:
          'Initialize the tools. Create an operational flowchart in a new `.excalidraw` board under `/workspace/canvases/` for lead qualification and sales handoff. Include stages, decisions, and internal owners.',
      },
    ],
  },
  {
    id: 'strategy',
    label: 'Planning & Strategy',
    templates: [
      {
        id: 'roadmap-board',
        icon: Layers,
        label: 'Roadmap Board',
        description: 'Themes, milestones, and bets',
        prompt:
          'Initialize the tools. Create a roadmap whiteboard in a new `.excalidraw` board under `/workspace/canvases/` with quarterly themes, milestone groupings, and risk callouts for the next two quarters.',
      },
      {
        id: 'decision-tree',
        icon: GitBranch,
        label: 'Decision Tree',
        description: 'Branches, risks, and outcomes',
        prompt:
          'Initialize the tools. Create a decision tree in a new `.excalidraw` board under `/workspace/canvases/` for choosing between build, buy, or partner. Include branch criteria, tradeoffs, and likely outcomes.',
      },
      {
        id: 'retro-board',
        icon: Sparkles,
        label: 'Retro Board',
        description: 'Wins, blockers, and next steps',
        prompt:
          'Initialize the tools. Create a retrospective board in a new `.excalidraw` board under `/workspace/canvases/` with columns for wins, pain points, experiments, and action items.',
      },
    ],
  },
];
