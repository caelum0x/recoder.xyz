import type { CanvasElement } from '~/lib/canvas/types';

interface ToolbarProps {
  onAddElement: (type: CanvasElement['type']) => void;
  onExport: () => void;
}

export function Toolbar({ onAddElement, onExport }: ToolbarProps) {
  const tools = [
    { type: 'div' as const, icon: 'i-ph:square', label: 'Box' },
    { type: 'button' as const, icon: 'i-ph:cursor-click', label: 'Button' },
    { type: 'input' as const, icon: 'i-ph:text-aa', label: 'Input' },
    { type: 'text' as const, icon: 'i-ph:text-t', label: 'Text' },
    { type: 'image' as const, icon: 'i-ph:image', label: 'Image' },
  ];

  return (
    <div className="flex items-center gap-2 p-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {tools.map((tool) => (
        <button
          key={tool.type}
          onClick={() => onAddElement(tool.type)}
          className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-bolt-elements-background-depth-3 rounded"
          title={tool.label}
        >
          <div className={`${tool.icon} text-xl`} />
          <span className="text-xs">{tool.label}</span>
        </button>
      ))}
      
      <div className="ml-auto">
        <button
          onClick={onExport}
          className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded hover:bg-bolt-elements-button-primary-backgroundHover"
        >
          Export Code
        </button>
      </div>
    </div>
  );
}
