import { useState } from 'react';

interface TokenControlProps {
  value: number;
  onChange: (value: number) => void;
}

const TOKEN_PRESETS = [
  { label: '1K', value: 1000 },
  { label: '4K', value: 4000 },
  { label: '8K', value: 8000 },
  { label: '16K', value: 16000 },
  { label: '32K', value: 32000 },
];

export function TokenControl({ value, onChange }: TokenControlProps) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-recoder-elements-textTertiary">Max Tokens:</span>
      <div className="flex gap-1 items-center">
        {TOKEN_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => { onChange(preset.value); setShowCustom(false); }}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              value === preset.value && !showCustom
                ? 'bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text'
                : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-4'
            }`}
          >
            {preset.label}
          </button>
        ))}
        {showCustom ? (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(Math.max(100, parseInt(e.target.value) || 1000))}
            className="w-16 px-1 py-0.5 rounded text-xs bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary border border-recoder-elements-borderColor"
            min={100}
            max={128000}
          />
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="px-2 py-0.5 rounded text-xs bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-4"
          >
            Custom
          </button>
        )}
      </div>
    </div>
  );
}
