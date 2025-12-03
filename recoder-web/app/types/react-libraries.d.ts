/**
 * Type augmentations for various React libraries to work with TypeScript 5.5+
 * Addresses TS2786: Component cannot be used as a JSX component errors
 */

import { FC, ComponentType } from 'react';

// Remix components
declare module '@remix-run/react' {
  export const Link: FC<any>;
  export const Outlet: FC<any>;
  export const RemixBrowser: FC<any>;
  export const RemixServer: FC<any>;
}

// react-resizable-panels
declare module 'react-resizable-panels' {
  export const Panel: FC<any>;
  export const PanelGroup: FC<any>;
  export const PanelResizeHandle: FC<any>;
}

// remix-island
declare module 'remix-island' {
  export const Island: FC<any>;
}
