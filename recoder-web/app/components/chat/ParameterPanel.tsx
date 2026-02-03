import { useStore } from '@nanostores/react';
import { useState, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import {
  inferenceParamsStore,
  activePresetStore,
  parameterPanelOpenStore,
  INFERENCE_PRESETS,
  PARAM_CONSTRAINTS,
  PARAM_TOOLTIPS,
  updateParam,
  applyPreset,
  resetToDefaults,
  toggleParameterPanel,
  type InferenceParams,
} from '~/lib/stores/inference-params';

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tooltip: string;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  tooltip,
  onChange,
  formatValue = (v) => v.toString(),
}: SliderControlProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate percentage for gradient background
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-bolt-elements-textPrimary">
            {label}
          </label>
          <div
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div className="i-ph:info text-bolt-elements-textTertiary cursor-help text-sm" />
            {showTooltip && (
              <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-bolt-elements-background-depth-4 border border-bolt-elements-borderColor rounded-lg shadow-lg text-xs text-bolt-elements-textSecondary z-50">
                {tooltip}
              </div>
            )}
          </div>
        </div>
        <span className="text-sm font-mono text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3 px-2 py-0.5 rounded">
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #f97316 0%, #f97316 ${percentage}%, var(--bolt-elements-bg-depth-3) ${percentage}%, var(--bolt-elements-bg-depth-3) 100%)`,
        }}
      />
      <div className="flex justify-between text-xs text-bolt-elements-textTertiary mt-1">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}

interface PresetButtonProps {
  preset: typeof INFERENCE_PRESETS[0];
  isActive: boolean;
  onClick: () => void;
}

function PresetButton({ preset, isActive, onClick }: PresetButtonProps) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-orange-500 text-white shadow-md'
          : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary'
      )}
      title={preset.description}
    >
      {preset.name}
    </button>
  );
}

export function ParameterPanel() {
  const params = useStore(inferenceParamsStore);
  const activePreset = useStore(activePresetStore);
  const isOpen = useStore(parameterPanelOpenStore);

  const handleParamChange = useCallback(
    <K extends keyof InferenceParams>(key: K) =>
      (value: InferenceParams[K]) => {
        updateParam(key, value);
      },
    []
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-xl shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <div className="flex items-center gap-2">
          <div className="i-ph:sliders-horizontal text-orange-500 text-lg" />
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">
            Model Parameters
          </h3>
        </div>
        <button
          onClick={() => toggleParameterPanel()}
          className="p-1 hover:bg-bolt-elements-background-depth-4 rounded transition-colors"
          title="Close"
        >
          <div className="i-ph:x text-bolt-elements-textSecondary" />
        </button>
      </div>

      {/* Presets */}
      <div className="px-4 py-3 border-b border-bolt-elements-borderColor">
        <div className="text-xs text-bolt-elements-textTertiary mb-2 uppercase tracking-wide">
          Presets
        </div>
        <div className="flex gap-2">
          {INFERENCE_PRESETS.map((preset) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              isActive={activePreset === preset.id}
              onClick={() => applyPreset(preset.id)}
            />
          ))}
        </div>
      </div>

      {/* Parameters */}
      <div className="px-4 py-4 max-h-[400px] overflow-y-auto">
        <SliderControl
          label="Temperature"
          value={params.temperature}
          min={PARAM_CONSTRAINTS.temperature.min}
          max={PARAM_CONSTRAINTS.temperature.max}
          step={PARAM_CONSTRAINTS.temperature.step}
          tooltip={PARAM_TOOLTIPS.temperature}
          onChange={handleParamChange('temperature')}
          formatValue={(v) => v.toFixed(1)}
        />

        <SliderControl
          label="Top P"
          value={params.topP}
          min={PARAM_CONSTRAINTS.topP.min}
          max={PARAM_CONSTRAINTS.topP.max}
          step={PARAM_CONSTRAINTS.topP.step}
          tooltip={PARAM_TOOLTIPS.topP}
          onChange={handleParamChange('topP')}
          formatValue={(v) => v.toFixed(2)}
        />

        <SliderControl
          label="Top K"
          value={params.topK}
          min={PARAM_CONSTRAINTS.topK.min}
          max={PARAM_CONSTRAINTS.topK.max}
          step={PARAM_CONSTRAINTS.topK.step}
          tooltip={PARAM_TOOLTIPS.topK}
          onChange={handleParamChange('topK')}
          formatValue={(v) => v.toString()}
        />

        <SliderControl
          label="Frequency Penalty"
          value={params.frequencyPenalty}
          min={PARAM_CONSTRAINTS.frequencyPenalty.min}
          max={PARAM_CONSTRAINTS.frequencyPenalty.max}
          step={PARAM_CONSTRAINTS.frequencyPenalty.step}
          tooltip={PARAM_TOOLTIPS.frequencyPenalty}
          onChange={handleParamChange('frequencyPenalty')}
          formatValue={(v) => v.toFixed(1)}
        />

        <SliderControl
          label="Presence Penalty"
          value={params.presencePenalty}
          min={PARAM_CONSTRAINTS.presencePenalty.min}
          max={PARAM_CONSTRAINTS.presencePenalty.max}
          step={PARAM_CONSTRAINTS.presencePenalty.step}
          tooltip={PARAM_TOOLTIPS.presencePenalty}
          onChange={handleParamChange('presencePenalty')}
          formatValue={(v) => v.toFixed(1)}
        />

        <SliderControl
          label="Max Tokens"
          value={params.maxTokens}
          min={PARAM_CONSTRAINTS.maxTokens.min}
          max={PARAM_CONSTRAINTS.maxTokens.max}
          step={PARAM_CONSTRAINTS.maxTokens.step}
          tooltip={PARAM_TOOLTIPS.maxTokens}
          onChange={handleParamChange('maxTokens')}
          formatValue={(v) => {
            if (v >= 1000) {
              return `${(v / 1000).toFixed(0)}K`;
            }
            return v.toString();
          }}
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <button
          onClick={resetToDefaults}
          className="w-full px-4 py-2 text-sm font-medium text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <div className="i-ph:arrow-counter-clockwise text-sm" />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

/**
 * Compact toggle button for the parameter panel
 */
export function ParameterPanelToggle() {
  const isOpen = useStore(parameterPanelOpenStore);
  const activePreset = useStore(activePresetStore);
  const params = useStore(inferenceParamsStore);

  return (
    <div className="relative">
      <button
        onClick={() => toggleParameterPanel()}
        className={classNames(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
          isOpen
            ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50'
            : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary'
        )}
        title="Adjust model parameters"
      >
        <div className="i-ph:sliders-horizontal text-sm" />
        <span className="hidden sm:inline">
          {activePreset
            ? INFERENCE_PRESETS.find((p) => p.id === activePreset)?.name
            : `T=${params.temperature.toFixed(1)}`}
        </span>
      </button>
      <ParameterPanel />
    </div>
  );
}
