import { classNames } from '~/utils/classNames';

interface DeepThinkToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function DeepThinkToggle({ enabled, onChange }: DeepThinkToggleProps) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={classNames(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
        enabled
          ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
          : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
      )}
      title="Deep Think Mode - Enhanced reasoning for complex problems"
    >
      <div className="i-ph:brain text-lg" />
      <span>Deep Think</span>
    </button>
  );
}
