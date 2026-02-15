// @ts-nocheck

import { useEffect, useImperativeHandle, useState } from "react";
import { SuggestionList } from "../suggestion-list";

export const EmojiList = ({ ref, ...props }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index) => {
    const item = props.items[index];

    if (item) {
      props.command({ name: item.name });
    }
  };

  const upHandler = () => {
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length
    );
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on items change
  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (x) => {
        if (x.event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (x.event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (x.event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: handler references are stable enough
    [upHandler, downHandler, enterHandler]
  );

  return (
    <SuggestionList
      items={props.items}
      onSelect={selectItem}
      render={(item) => (
        <div className="flex items-center gap-1">
          {item.fallbackImage ? (
            // biome-ignore lint/performance/noImgElement: editor package, not Next.js
            <img
              align="absmiddle"
              alt=""
              className="h-4"
              height={16}
              src={item.fallbackImage}
              width={16}
            />
          ) : (
            item.emoji
          )}
          :{item.name}:
        </div>
      )}
      selected={selectedIndex}
    />
  );
};

EmojiList.displayName = "EmojiList";
