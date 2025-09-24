'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Props that will be passed to the Monaco Editor
export interface MonacoEditorProps {
  height?: string;
  language?: string;
  value?: string;
  onChange?: (value: string) => void;
  theme?: string;
  options?: any;
}

// Dynamically import Monaco Editor with no SSR
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { 
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <div className="text-gray-600">Loading Monaco Editor...</div>
        </div>
      </div>
    )
  }
);

// Client-only wrapper component
export default function ClientOnlyMonaco(props: MonacoEditorProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Only render on client side
  if (!isMounted) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <div className="text-gray-600">Initializing editor...</div>
        </div>
      </div>
    );
  }

  // Adapt onChange to match Monaco Editor's expected signature
  const { onChange, ...restProps } = props;
  return (
    <MonacoEditor
      {...restProps}
      onChange={
        onChange
          ? (value: string | undefined, _event: any) => {
              if (typeof value === 'string') {
                onChange(value);
              }
            }
          : undefined
      }
    />
  );
}