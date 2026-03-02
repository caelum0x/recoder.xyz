import { useState } from 'react';
import type { CanvasElement } from '~/lib/canvas/types';
import { createElement, moveElement, updateStyles, exportToCode } from '~/lib/canvas/engine';
import { Canvas } from './Canvas';
import { PropertyPanel } from './PropertyPanel';
import { Toolbar } from './Toolbar';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('CanvasEditor');

export function CanvasEditor() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleAddElement = (type: CanvasElement['type']) => {
    const newElement = createElement(type, 50 + elements.length * 20, 50 + elements.length * 20);
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  const handleMove = (id: string, dx: number, dy: number) => {
    setElements(elements.map(el => 
      el.id === id ? moveElement(el, dx, dy) : el
    ));
  };

  const handleUpdateStyles = (styles: React.CSSProperties) => {
    if (!selectedId) return;
    setElements(elements.map(el =>
      el.id === selectedId ? updateStyles(el, styles) : el
    ));
  };

  const handleExport = () => {
    const code = exportToCode(elements);
    logger.info('Exported code:', code);
    navigator.clipboard.writeText(code);
    alert('Code copied to clipboard!');
  };

  const selectedElement = elements.find(el => el.id === selectedId) || null;

  return (
    <div className="flex flex-col h-full">
      <Toolbar onAddElement={handleAddElement} onExport={handleExport} />
      
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Canvas
            elements={elements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
          />
        </div>
        
        <div className="w-64 border-l border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 overflow-auto">
          <PropertyPanel
            element={selectedElement}
            onUpdate={handleUpdateStyles}
          />
        </div>
      </div>
    </div>
  );
}
