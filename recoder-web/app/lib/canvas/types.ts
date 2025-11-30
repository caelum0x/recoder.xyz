export interface CanvasElement {
  id: string;
  type: 'div' | 'button' | 'input' | 'text' | 'image' | 'container';
  props: Record<string, any>;
  styles: React.CSSProperties;
  children: CanvasElement[];
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface CanvasState {
  elements: CanvasElement[];
  selectedId: string | null;
  zoom: number;
}
