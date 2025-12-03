/**
 * Type augmentations for lucide-react to work with TypeScript 5.5+
 * Addresses TS2786: 'X' cannot be used as a JSX component errors
 */

declare module 'lucide-react' {
  import { FC, SVGProps } from 'react';

  export type IconProps = SVGProps<SVGSVGElement> & {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
    absoluteStrokeWidth?: boolean;
  };

  export type Icon = FC<IconProps>;

  // Explicitly type all icons as valid React components
  export const CheckCircle: Icon;
  export const CheckCircle2: Icon;
  export const XCircle: Icon;
  export const AlertCircle: Icon;
  export const Circle: Icon;
  export const Server: Icon;
  export const Power: Icon;
  export const PowerOff: Icon;
  export const Plus: Icon;
  export const Trash2: Icon;
  export const Settings: Icon;
  export const RefreshCw: Icon;
  export const Loader2: Icon;
  export const Download: Icon;
  export const X: Icon;
  export const Github: Icon;
  export const GitBranch: Icon;
  export const Wrench: Icon;
  export const Play: Icon;

  // Add more as needed
  const icons: Record<string, Icon>;
  export default icons;
}
