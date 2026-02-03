import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';
import {
  DEVICE_PRESETS,
  type DevicePreset,
  previewDeviceState,
  selectedDevice,
  effectiveDimensions,
  selectDevice,
  toggleOrientation,
  setZoom,
  zoomIn,
  zoomOut,
} from '~/lib/stores/preview-device';
import {
  previewSettingsStore,
  setQuickDevicePreset,
  QUICK_PRESET_DEVICE_MAP,
  type QuickDevicePreset,
} from '~/lib/stores/preview-settings';

// Group definitions for the device dropdown
const DEVICE_GROUPS: { label: string; type: DevicePreset['deviceType'] }[] = [
  { label: 'Phones', type: 'phone' },
  { label: 'Tablets', type: 'tablet' },
  { label: 'Desktop', type: 'desktop' },
];

const QUICK_PRESETS: { key: QuickDevicePreset; icon: string; label: string }[] = [
  { key: 'desktop', icon: 'i-ph:desktop', label: 'Desktop' },
  { key: 'tablet', icon: 'i-ph:device-tablet', label: 'Tablet' },
  { key: 'mobile', icon: 'i-ph:device-mobile', label: 'Mobile' },
];

export const PreviewToolbar = memo(() => {
  const deviceState = useStore(previewDeviceState);
  const device = useStore(selectedDevice);
  const dims = useStore(effectiveDimensions);
  const settings = useStore(previewSettingsStore);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleQuickPreset = useCallback(
    (preset: QuickDevicePreset) => {
      setQuickDevicePreset(preset);
      selectDevice(QUICK_PRESET_DEVICE_MAP[preset]);
    },
    [],
  );

  const handleSelectDevice = useCallback((deviceId: string) => {
    selectDevice(deviceId);
    setDropdownOpen(false);
  }, []);

  const handleFitToContainer = useCallback(() => {
    // Reset zoom to 1 as a "fit" shortcut -- the Preview panel can
    // use calculateFitScale for a precise value, but from the toolbar
    // we simply reset to 100%.
    setZoom(1);
  }, []);

  const zoomPercent = Math.round(deviceState.zoom * 100);

  // Determine which quick preset is active based on current device
  const activeQuickPreset = (() => {
    for (const [key, id] of Object.entries(QUICK_PRESET_DEVICE_MAP)) {
      if (deviceState.selectedDeviceId === id) {
        return key as QuickDevicePreset;
      }
    }

    return null;
  })();

  // Group devices for dropdown
  const groupedDevices = DEVICE_GROUPS.map((group) => ({
    ...group,
    devices: DEVICE_PRESETS.filter((d) => d.deviceType === group.type),
  }));

  return (
    <div className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor flex items-center gap-1 px-2 h-8 min-h-[32px] text-xs select-none">
      {/* Quick presets */}
      <div className="flex items-center gap-0.5">
        {QUICK_PRESETS.map((preset) => {
          const isActive = activeQuickPreset === preset.key;

          return (
            <button
              key={preset.key}
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={isActive}
              onClick={() => handleQuickPreset(preset.key)}
              className={classNames(
                'flex items-center justify-center w-6 h-6 rounded transition-colors',
                isActive
                  ? 'text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
              )}
            >
              <div className={classNames(preset.icon, 'text-sm')} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-bolt-elements-borderColor mx-0.5" />

      {/* Device dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
          className={classNames(
            'flex items-center gap-1 h-6 px-2 rounded text-xs transition-colors max-w-[180px]',
            'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
          )}
        >
          <span className="truncate">{device.name}</span>
          <div
            className={classNames(
              'i-ph:caret-down text-[10px] transition-transform flex-shrink-0',
              dropdownOpen ? 'rotate-180' : '',
            )}
            aria-hidden="true"
          />
        </button>

        {dropdownOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-50 w-64 max-h-80 overflow-y-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-lg py-1"
            role="listbox"
            aria-label="Select device"
          >
            {groupedDevices.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-bolt-elements-textSecondary">
                  {group.label}
                </div>
                {group.devices.map((d) => {
                  const isSelected = deviceState.selectedDeviceId === d.id;

                  return (
                    <button
                      key={d.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectDevice(d.id)}
                      className={classNames(
                        'w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors',
                        isSelected
                          ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                          : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
                      )}
                    >
                      <span className="truncate">{d.name}</span>
                      {d.width > 0 && (
                        <span className="text-[10px] text-bolt-elements-textSecondary ml-2 tabular-nums flex-shrink-0">
                          {d.width}&times;{d.height}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-bolt-elements-borderColor mx-0.5" />

      {/* Orientation toggle */}
      <button
        title={deviceState.orientation === 'portrait' ? 'Switch to landscape' : 'Switch to portrait'}
        aria-label="Toggle orientation"
        onClick={toggleOrientation}
        className="flex items-center justify-center w-6 h-6 rounded text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors"
      >
        <div
          className={classNames(
            deviceState.orientation === 'landscape' ? 'i-ph:arrows-horizontal' : 'i-ph:arrows-vertical',
            'text-sm',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-bolt-elements-borderColor mx-0.5" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <button
          title="Fit to container"
          aria-label="Fit to container"
          onClick={handleFitToContainer}
          className={classNames(
            'h-6 px-1.5 rounded text-[10px] font-medium transition-colors',
            deviceState.zoom === 1
              ? 'text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
          )}
        >
          Fit
        </button>
        <button
          title="Zoom out"
          aria-label="Zoom out"
          onClick={zoomOut}
          disabled={deviceState.zoom <= 0.25}
          className="flex items-center justify-center w-5 h-6 rounded text-bolt-elements-textSecondary enabled:hover:text-bolt-elements-textPrimary enabled:hover:bg-bolt-elements-background-depth-3 disabled:opacity-30 transition-colors"
        >
          <div className="i-ph:minus text-[10px]" aria-hidden="true" />
        </button>
        <span className="text-[10px] tabular-nums text-bolt-elements-textSecondary w-7 text-center">
          {zoomPercent}%
        </span>
        <button
          title="Zoom in"
          aria-label="Zoom in"
          onClick={zoomIn}
          disabled={deviceState.zoom >= 2}
          className="flex items-center justify-center w-5 h-6 rounded text-bolt-elements-textSecondary enabled:hover:text-bolt-elements-textPrimary enabled:hover:bg-bolt-elements-background-depth-3 disabled:opacity-30 transition-colors"
        >
          <div className="i-ph:plus text-[10px]" aria-hidden="true" />
        </button>
      </div>

      {/* Dimensions display (right side) */}
      {!dims.isResponsive && (
        <>
          <div className="w-px h-4 bg-bolt-elements-borderColor mx-0.5" />
          <span className="text-[10px] tabular-nums text-bolt-elements-textSecondary ml-auto">
            {dims.width}&times;{dims.height}
          </span>
        </>
      )}
    </div>
  );
});
