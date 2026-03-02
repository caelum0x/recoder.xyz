import { useState, useRef } from 'react';
import type { CanvasElement } from '~/lib/canvas/types';
import { moveElement } from '~/lib/canvas/engine';
import { classNames } from '~/utils/classNames';

interface CanvasProps {
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dx: number, dy: number) => void;
}

export function Canvas({ elements, selectedId, onSelect, onMove }: CanvasProps) {
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent, element: CanvasElement) => {
    e.stopPropagation();
    onSelect(element.id);
    setDragging({ id: element.id, startX: e.clientX, startY: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    onMove(dragging.id, dx, dy);
    setDragging({ ...dragging, startX: e.clientX, startY: e.clientY });
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  const renderElement = (element: CanvasElement) => {
    const isSelected = element.id === selectedId;
    const style = {
      ...element.styles,
      position: 'absolute' as const,
      left: element.position.x,
      top: element.position.y,
      width: element.size.width,
      height: element.size.height,
      cursor: 'move',
      outline: isSelected ? '2px solid #3b82f6' : 'none',
    };

    const commonProps = {
      key: element.id,
      style,
      onMouseDown: (e: React.MouseEvent) => handleMouseDown(e, element),
    };

    switch (element.type) {
      case 'button':
        return <button {...commonProps}>{element.props.children}</button>;
      case 'input':
        return <input {...commonProps} placeholder={element.props.placeholder} />;
      case 'text':
        return <span {...commonProps}>{element.props.children}</span>;
      case 'image':
        return <img {...commonProps} src={element.props.src} alt={element.props.alt} />;
      default:
        return (
          <div {...commonProps}>
            {element.children.map(renderElement)}
          </div>
        );
    }
  };

  return (
    <div
      className="relative w-full h-full bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {elements.map(renderElement)}
    </div>
  );
}
