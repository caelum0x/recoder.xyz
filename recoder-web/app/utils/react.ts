import { type JSXElementConstructor, memo } from 'react';

export const genericMemo: <T extends keyof React.JSX.IntrinsicElements | JSXElementConstructor<any>>(
  component: T,
  propsAreEqual?: (prevProps: React.ComponentProps<T>, nextProps: React.ComponentProps<T>) => boolean,
) => T & { displayName?: string } = memo;
