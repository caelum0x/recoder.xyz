import { classNames } from '~/utils/classNames';

interface LightningModeProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function LightningMode({ enabled, onChange }: LightningModeProps) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={classNames(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors h-[38px]',
        {
          'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30': enabled,
          'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3': !enabled,
        }
      )}
      title={enabled ? 'Lightning Mode: Fast responses with lighter models' : 'Enable Lightning Mode for faster responses'}
    >
      <div className={classNames('text-lg', {
        'i-ph:lightning-fill': enabled,
        'i-ph:lightning': !enabled,
      })} />
      <span className="font-medium whitespace-nowrap">Light</span>
    </button>
  );
}
