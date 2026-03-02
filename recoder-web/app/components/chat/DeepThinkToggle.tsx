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
          ? 'bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text'
          : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3'
      )}
      title="Deep Think Mode - Enhanced reasoning for complex problems"
    >
      <div className="i-ph:brain text-lg" />
      <span>Deep Think</span>
    </button>
  );
}
