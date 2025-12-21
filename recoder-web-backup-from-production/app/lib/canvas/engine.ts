import type { CanvasElement } from './types';

export function createElement(type: CanvasElement['type'], x = 0, y = 0): CanvasElement {
  const id = crypto.randomUUID();
  
  const defaults: Record<string, Partial<CanvasElement>> = {
    div: {
      size: { width: 200, height: 100 },
      styles: { backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px' },
    },
    button: {
      size: { width: 120, height: 40 },
      styles: { backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px' },
      props: { children: 'Button' },
    },
    input: {
      size: { width: 200, height: 40 },
      styles: { border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px' },
      props: { placeholder: 'Enter text...' },
    },
    text: {
      size: { width: 150, height: 30 },
      styles: { fontSize: '16px', color: '#111827' },
      props: { children: 'Text' },
    },
    image: {
      size: { width: 200, height: 150 },
      styles: { objectFit: 'cover', borderRadius: '8px' },
      props: { src: 'https://via.placeholder.com/200x150', alt: 'Image' },
    },
  };

  return {
    id,
    type,
    position: { x, y },
    children: [],
    ...defaults[type],
  } as CanvasElement;
}

export function moveElement(element: CanvasElement, dx: number, dy: number): CanvasElement {
  return {
    ...element,
    position: {
      x: element.position.x + dx,
      y: element.position.y + dy,
    },
  };
}

export function resizeElement(element: CanvasElement, width: number, height: number): CanvasElement {
  return {
    ...element,
    size: { width, height },
  };
}

export function updateStyles(element: CanvasElement, styles: React.CSSProperties): CanvasElement {
  return {
    ...element,
    styles: { ...element.styles, ...styles },
  };
}

export function exportToCode(elements: CanvasElement[]): string {
  const generateElement = (el: CanvasElement, indent = 0): string => {
    const spaces = '  '.repeat(indent);
    const styleStr = JSON.stringify(el.styles);
    
    switch (el.type) {
      case 'button':
        return `${spaces}<button style={${styleStr}}>${el.props.children || 'Button'}</button>`;
      case 'input':
        return `${spaces}<input style={${styleStr}} placeholder="${el.props.placeholder || ''}" />`;
      case 'text':
        return `${spaces}<span style={${styleStr}}>${el.props.children || 'Text'}</span>`;
      case 'image':
        return `${spaces}<img style={${styleStr}} src="${el.props.src}" alt="${el.props.alt}" />`;
      default:
        const children = el.children.map(c => generateElement(c, indent + 1)).join('\n');
        return `${spaces}<div style={${styleStr}}>\n${children}\n${spaces}</div>`;
    }
  };

  return elements.map(el => generateElement(el)).join('\n');
}
