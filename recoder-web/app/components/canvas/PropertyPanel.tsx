import type { CanvasElement } from '~/lib/canvas/types';

interface PropertyPanelProps {
  element: CanvasElement | null;
  onUpdate: (styles: React.CSSProperties) => void;
}

export function PropertyPanel({ element, onUpdate }: PropertyPanelProps) {
  if (!element) {
    return (
      <div className="p-4 text-center text-bolt-elements-textSecondary">
        Select an element to edit properties
      </div>
    );
  }

  const handleChange = (key: string, value: string) => {
    onUpdate({ [key]: value });
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-bolt-elements-textPrimary">Properties</h3>

      <div>
        <label className="block text-sm mb-1">Background</label>
        <input
          type="color"
          value={element.styles.backgroundColor as string || '#ffffff'}
          onChange={(e) => handleChange('backgroundColor', e.target.value)}
          className="w-full h-8 rounded"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Border Radius</label>
        <input
          type="range"
          min="0"
          max="50"
          value={parseInt(element.styles.borderRadius as string || '0')}
          onChange={(e) => handleChange('borderRadius', `${e.target.value}px`)}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Opacity</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={element.styles.opacity || 1}
          onChange={(e) => handleChange('opacity', e.target.value)}
          className="w-full"
        />
      </div>

      {element.type === 'text' && (
        <>
          <div>
            <label className="block text-sm mb-1">Font Size</label>
            <input
              type="number"
              value={parseInt(element.styles.fontSize as string || '16')}
              onChange={(e) => handleChange('fontSize', `${e.target.value}px`)}
              className="w-full px-2 py-1 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Color</label>
            <input
              type="color"
              value={element.styles.color as string || '#000000'}
              onChange={(e) => handleChange('color', e.target.value)}
              className="w-full h-8 rounded"
            />
          </div>
        </>
      )}
    </div>
  );
}
