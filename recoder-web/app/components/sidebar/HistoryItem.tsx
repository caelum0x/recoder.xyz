import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@remix-run/react';
import { type ChatHistoryItem } from '~/lib/persistence';

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
}

export function HistoryItem({ item, onDelete }: HistoryItemProps) {
  const [hovering, setHovering] = useState(false);
  const hoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;

    function mouseEnter() {
      setHovering(true);

      if (timeout) {
        clearTimeout(timeout);
      }
    }

    function mouseLeave() {
      setHovering(false);
    }

    hoverRef.current?.addEventListener('mouseenter', mouseEnter);
    hoverRef.current?.addEventListener('mouseleave', mouseLeave);

    return () => {
      hoverRef.current?.removeEventListener('mouseenter', mouseEnter);
      hoverRef.current?.removeEventListener('mouseleave', mouseLeave);
    };
  }, []);

  return (
    <div
      ref={hoverRef}
      className="group rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 overflow-hidden flex justify-between items-center px-2 py-1"
    >
      <Link to={`/chat/${item.urlId}`} className="flex w-full relative truncate block">
        {item.description}
        <div className="absolute right-0 z-1 top-0 bottom-0 bg-gradient-to-l from-bolt-elements-background-depth-2 group-hover:from-bolt-elements-background-depth-3 to-transparent w-10 flex justify-end group-hover:w-15 group-hover:from-45% pointer-events-none">
          {hovering && (
            <div className="flex items-center p-1 text-bolt-elements-textSecondary hover:text-red-500 pointer-events-auto">
              <Dialog.Trigger asChild>
                <button
                  className="i-ph:trash scale-110"
                  onClick={(event) => {
                    // we prevent the default so we don't trigger the Link above
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete?.(event);
                  }}
                />
              </Dialog.Trigger>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
