'use client';

/**
 * 💻 Terminal Component
 * Xterm.js terminal for WebContainer shell
 */

import { useEffect, useRef } from 'react';

interface TerminalProps {
  attachTerminal?: (element: HTMLElement, command?: string) => Promise<(() => void) | undefined>;
}

export default function Terminal({ attachTerminal }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalRef.current || !attachTerminal) return;

    let cleanup: (() => void) | undefined;

    attachTerminal(terminalRef.current, 'jsh')
      .then((cleanupFn) => {
        cleanup = cleanupFn;
      })
      .catch(console.error);

    return () => {
      cleanup?.();
    };
  }, [attachTerminal]);

  return (
    <div className="h-full w-full bg-[#1a1a1a]">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  );
}
