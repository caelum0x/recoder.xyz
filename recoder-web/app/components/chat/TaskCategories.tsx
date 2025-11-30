import { useState } from 'react';
import { classNames } from '~/utils/classNames';

export type TaskCategory = 
  | 'code' 
  | 'debug' 
  | 'refactor' 
  | 'explain' 
  | 'test' 
  | 'deploy'
  | 'general';

interface TaskCategoriesProps {
  selected: TaskCategory;
  onChange: (category: TaskCategory) => void;
}

const categories = [
  { id: 'code' as TaskCategory, label: 'Code', icon: 'i-ph:code', color: 'blue' },
  { id: 'debug' as TaskCategory, label: 'Debug', icon: 'i-ph:bug', color: 'red' },
  { id: 'refactor' as TaskCategory, label: 'Refactor', icon: 'i-ph:arrows-clockwise', color: 'purple' },
  { id: 'explain' as TaskCategory, label: 'Explain', icon: 'i-ph:lightbulb', color: 'yellow' },
  { id: 'test' as TaskCategory, label: 'Test', icon: 'i-ph:test-tube', color: 'green' },
  { id: 'deploy' as TaskCategory, label: 'Deploy', icon: 'i-ph:rocket-launch', color: 'orange' },
  { id: 'general' as TaskCategory, label: 'General', icon: 'i-ph:chat-circle', color: 'gray' },
];

export function TaskCategories({ selected, onChange }: TaskCategoriesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedCategory = categories.find(c => c.id === selected) || categories[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors font-medium whitespace-nowrap h-[38px] text-sm',
          'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'text-bolt-elements-textPrimary'
        )}
      >
        <div className={classNames(selectedCategory.icon, 'text-lg')} />
        <span>{selectedCategory.label}</span>
        <div className="i-ph:caret-down text-xs" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full mb-1 left-0 rounded-lg shadow-lg z-[1000] min-w-[200px]"
            style={{ zIndex: 1000, backgroundColor: '#000000', borderColor: '#000000', border: '1px solid #000000' }}>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  onChange(category.id);
                  setIsOpen(false);
                }}
                className={classNames(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white transition-colors first:rounded-t-lg last:rounded-b-lg bg-black',
                  'hover:bg-gray-900',
                  {
                    'bg-gray-900': selected === category.id,
                  }
                )}
                style={{ backgroundColor: selected === category.id ? '#333333' : '#000000' }}
              >
                <div className={classNames(category.icon, 'text-lg')} />
                <span>{category.label}</span>
                {selected === category.id && (
                  <div className="i-ph:check ml-auto text-green-500" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
