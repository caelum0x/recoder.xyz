/**
 * Workbench with Resizable Panels
 * Allows users to resize editor, terminal, and preview panels
 */

import { useState } from 'react';
import { ResizablePanels } from '~/components/ui/ResizablePanels';

interface WorkbenchResizableProps {
  editor: React.ReactNode;
  terminal: React.ReactNode;
  preview: React.ReactNode;
}

export function WorkbenchResizable({ editor, terminal, preview }: WorkbenchResizableProps) {
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>('vertical');

  return (
    <div className="h-full w-full flex flex-col">
      {/* Layout Toggle */}
      <div className="flex items-center gap-2 p-2 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-2">
        <button
          onClick={() => setLayout('vertical')}
          className={`px-3 py-1 text-xs rounded ${
            layout === 'vertical'
              ? 'bg-recoder-elements-item-backgroundActive text-recoder-elements-item-contentActive'
              : 'hover:bg-recoder-elements-item-backgroundHover'
          }`}
        >
          Vertical Split
        </button>
        <button
          onClick={() => setLayout('horizontal')}
          className={`px-3 py-1 text-xs rounded ${
            layout === 'horizontal'
              ? 'bg-recoder-elements-item-backgroundActive text-recoder-elements-item-contentActive'
              : 'hover:bg-recoder-elements-item-backgroundHover'
          }`}
        >
          Horizontal Split
        </button>
      </div>

      {/* Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        {layout === 'vertical' ? (
          <ResizablePanels
            leftPanel={
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-hidden">{editor}</div>
                <div className="h-64 border-t border-recoder-elements-borderColor overflow-hidden">
                  {terminal}
                </div>
              </div>
            }
            rightPanel={preview}
            defaultLeftWidth={60}
            minLeftWidth={30}
            maxLeftWidth={80}
          />
        ) : (
          <div className="h-full flex flex-col">
            <ResizablePanels
              leftPanel={editor}
              rightPanel={preview}
              defaultLeftWidth={50}
              minLeftWidth={30}
              maxLeftWidth={70}
            />
            <div className="h-64 border-t border-recoder-elements-borderColor overflow-hidden">
              {terminal}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
