/**
 * Visual Editing Toolbar
 * A toolbar that appears when visual editing mode is enabled and a component is selected.
 * Allows quick style edits (margin, padding, colors, fonts) and "Edit in chat" functionality.
 *
 * Inspired by dyad's implementation.
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  visualEditingEnabled,
  selectedComponent,
  componentCoordinates,
  isDynamicallyStyled,
  hasStaticText,
  clearSelection,
  addPendingStyleChange,
  generateEditPrompt,
  type ComponentStyles,
} from '~/lib/stores/visual-editing';

// Font weight options
const FONT_WEIGHT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: '100', label: 'Thin (100)' },
  { value: '200', label: 'Extra Light (200)' },
  { value: '300', label: 'Light (300)' },
  { value: '400', label: 'Normal (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semi Bold (600)' },
  { value: '700', label: 'Bold (700)' },
  { value: '800', label: 'Extra Bold (800)' },
  { value: '900', label: 'Black (900)' },
] as const;

// Font family options
const FONT_FAMILY_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: 'Consolas, monospace', label: 'Consolas' },
] as const;

interface VisualEditingToolbarProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onEditInChat?: (prompt: string) => void;
}

// Style Popover component
interface StylePopoverProps {
  icon: React.ReactNode;
  tooltip: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
}

function StylePopover({ icon, tooltip, children, side = 'bottom' }: StylePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(
          'p-1.5 rounded hover:bg-bolt-elements-item-backgroundActive',
          'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          'transition-colors'
        )}
        title={tooltip}
      >
        {icon}
      </button>

      {isOpen && (
        <div
          className={classNames(
            'absolute z-50 w-56 p-3',
            'bg-bolt-elements-background-depth-3 rounded-lg shadow-xl',
            'border border-bolt-elements-borderColor',
            'animate-fadeIn',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            'left-0'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Number input with label
interface NumberInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function NumberInput({ label, value, onChange, placeholder = '0' }: NumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-bolt-elements-textSecondary w-16">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={classNames(
          'flex-1 h-7 px-2 text-xs rounded',
          'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
          'border border-bolt-elements-borderColor',
          'focus:outline-none focus:border-accent-500'
        )}
      />
    </div>
  );
}

// Color picker input
interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className={classNames(
          'flex-1 h-7 px-2 text-xs rounded font-mono',
          'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
          'border border-bolt-elements-borderColor',
          'focus:outline-none focus:border-accent-500'
        )}
      />
    </div>
  );
}

export const VisualEditingToolbar = memo(({ iframeRef, onEditInChat }: VisualEditingToolbarProps) => {
  const enabled = useStore(visualEditingEnabled);
  const component = useStore(selectedComponent);
  const coordinates = useStore(componentCoordinates);
  const isDynamic = useStore(isDynamicallyStyled);
  const hasText = useStore(hasStaticText);

  // Local state for style inputs
  const [margin, setMargin] = useState({ x: '', y: '' });
  const [padding, setPadding] = useState({ x: '', y: '' });
  const [border, setBorder] = useState({ width: '', radius: '', color: '#000000' });
  const [bgColor, setBgColor] = useState('#ffffff');
  const [textStyles, setTextStyles] = useState({
    fontSize: '',
    fontWeight: '',
    fontFamily: '',
    color: '#000000',
  });

  // Reset local state when component changes
  useEffect(() => {
    if (component?.computedStyles) {
      const styles = component.computedStyles;

      // Set margin (use horizontal/vertical if they match)
      if (styles.margin) {
        const mx = styles.margin.left === styles.margin.right ? styles.margin.left : '';
        const my = styles.margin.top === styles.margin.bottom ? styles.margin.top : '';
        setMargin({ x: mx, y: my });
      }

      // Set padding
      if (styles.padding) {
        const px = styles.padding.left === styles.padding.right ? styles.padding.left : '';
        const py = styles.padding.top === styles.padding.bottom ? styles.padding.top : '';
        setPadding({ x: px, y: py });
      }

      // Set border
      if (styles.border) {
        setBorder({
          width: styles.border.width || '',
          radius: styles.border.radius || '',
          color: styles.border.color || '#000000',
        });
      }

      // Set background color
      if (styles.backgroundColor) {
        setBgColor(styles.backgroundColor);
      }

      // Set text styles
      if (styles.text) {
        setTextStyles({
          fontSize: styles.text.fontSize || '',
          fontWeight: styles.text.fontWeight || '',
          fontFamily: styles.text.fontFamily || '',
          color: styles.text.color || '#000000',
        });
      }
    }
  }, [component]);

  // Process numeric value (add 'px' if needed)
  const processValue = useCallback((value: string): string => {
    if (!value) return '';
    if (/^\d+$/.test(value)) {
      return `${value}px`;
    }
    return value;
  }, []);

  // Send style modification to iframe
  const sendStyleModification = useCallback(
    (styles: Partial<ComponentStyles>) => {
      if (!iframeRef.current?.contentWindow || !component) return;

      // Send to iframe for live preview
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'recoder:modify-styles',
          data: {
            elementId: component.id,
            styles,
          },
        },
        '*'
      );

      // Add to pending changes
      addPendingStyleChange({
        componentId: component.id,
        componentName: component.name,
        filePath: component.filePath,
        lineNumber: component.lineNumber,
        styles,
      });
    },
    [component, iframeRef]
  );

  // Handle spacing change (margin/padding)
  const handleSpacingChange = useCallback(
    (type: 'margin' | 'padding', axis: 'x' | 'y', value: string) => {
      const setter = type === 'margin' ? setMargin : setPadding;
      setter((prev) => ({ ...prev, [axis]: value }));

      if (value) {
        const processed = processValue(value);
        const data =
          axis === 'x'
            ? { left: processed, right: processed }
            : { top: processed, bottom: processed };

        sendStyleModification({ [type]: data });
      }
    },
    [processValue, sendStyleModification]
  );

  // Handle border change
  const handleBorderChange = useCallback(
    (property: 'width' | 'radius' | 'color', value: string) => {
      setBorder((prev) => ({ ...prev, [property]: value }));

      if (value) {
        const processed = property !== 'color' ? processValue(value) : value;
        sendStyleModification({ border: { [property]: processed } as any });
      }
    },
    [processValue, sendStyleModification]
  );

  // Handle text style change
  const handleTextStyleChange = useCallback(
    (property: 'fontSize' | 'fontWeight' | 'fontFamily' | 'color', value: string) => {
      setTextStyles((prev) => ({ ...prev, [property]: value }));

      if (value) {
        const processed = property === 'fontSize' ? processValue(value) : value;
        sendStyleModification({ text: { [property]: processed } as any });
      }
    },
    [processValue, sendStyleModification]
  );

  // Handle deselect
  const handleDeselect = useCallback(() => {
    // Send deselect message to iframe
    if (iframeRef.current?.contentWindow && component) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'recoder:remove-overlay',
          componentId: component.id,
        },
        '*'
      );
    }

    clearSelection();
  }, [component, iframeRef]);

  // Handle edit in chat
  const handleEditInChat = useCallback(() => {
    const prompt = generateEditPrompt();
    if (prompt && onEditInChat) {
      onEditInChat(prompt);
    }
  }, [onEditInChat]);

  // Don't render if not enabled or no component selected
  if (!enabled || !component || !coordinates) {
    return null;
  }

  // Calculate toolbar position (below the selected element)
  const toolbarTop = coordinates.top + coordinates.height + 8;
  const toolbarLeft = Math.max(8, coordinates.left);

  return (
    <div
      className={classNames(
        'absolute z-50 flex items-center gap-1 p-2',
        'bg-bolt-elements-background-depth-3 rounded-lg shadow-xl',
        'border border-bolt-elements-borderColor',
        'animate-fadeIn'
      )}
      style={{
        top: `${toolbarTop}px`,
        left: `${toolbarLeft}px`,
        maxWidth: 'calc(100% - 16px)',
      }}
    >
      {/* Deselect button */}
      <button
        onClick={handleDeselect}
        className={classNames(
          'p-1.5 rounded hover:bg-bolt-elements-item-backgroundActive',
          'text-accent-500 hover:text-accent-600',
          'transition-colors'
        )}
        title="Deselect component"
      >
        <div className="i-ph:x text-base" />
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-bolt-elements-borderColor mx-1" />

      {/* Component info */}
      <div className="flex items-center gap-2 px-2 min-w-0">
        <span className="text-xs font-medium text-accent-500 truncate max-w-[120px]">
          {component.name}
        </span>
        {component.lineNumber && (
          <span className="text-xs text-bolt-elements-textTertiary">
            :{component.lineNumber}
          </span>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-bolt-elements-borderColor mx-1" />

      {isDynamic ? (
        // Show warning for dynamically styled components
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-yellow-600">
          <div className="i-ph:warning text-base" />
          <span>Dynamic styles</span>
        </div>
      ) : (
        // Style controls
        <>
          {/* Margin */}
          <StylePopover
            icon={<div className="i-ph:arrows-out-cardinal text-base" />}
            tooltip="Margin"
          >
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-accent-500 mb-2">Margin</h4>
              <NumberInput
                label="Horizontal"
                value={margin.x}
                onChange={(v) => handleSpacingChange('margin', 'x', v)}
                placeholder="10"
              />
              <NumberInput
                label="Vertical"
                value={margin.y}
                onChange={(v) => handleSpacingChange('margin', 'y', v)}
                placeholder="10"
              />
            </div>
          </StylePopover>

          {/* Padding */}
          <StylePopover
            icon={<div className="i-ph:square text-base" />}
            tooltip="Padding"
          >
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-accent-500 mb-2">Padding</h4>
              <NumberInput
                label="Horizontal"
                value={padding.x}
                onChange={(v) => handleSpacingChange('padding', 'x', v)}
                placeholder="10"
              />
              <NumberInput
                label="Vertical"
                value={padding.y}
                onChange={(v) => handleSpacingChange('padding', 'y', v)}
                placeholder="10"
              />
            </div>
          </StylePopover>

          {/* Border */}
          <StylePopover
            icon={<div className="i-ph:bounding-box text-base" />}
            tooltip="Border"
          >
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-accent-500 mb-2">Border</h4>
              <NumberInput
                label="Width"
                value={border.width}
                onChange={(v) => handleBorderChange('width', v)}
                placeholder="1"
              />
              <NumberInput
                label="Radius"
                value={border.radius}
                onChange={(v) => handleBorderChange('radius', v)}
                placeholder="4"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-bolt-elements-textSecondary w-16">Color</label>
                <ColorPicker
                  value={border.color}
                  onChange={(v) => handleBorderChange('color', v)}
                />
              </div>
            </div>
          </StylePopover>

          {/* Background Color */}
          <StylePopover
            icon={<div className="i-ph:palette text-base" />}
            tooltip="Background"
          >
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-accent-500 mb-2">Background Color</h4>
              <ColorPicker
                value={bgColor}
                onChange={(v) => {
                  setBgColor(v);
                  if (v) sendStyleModification({ backgroundColor: v });
                }}
              />
            </div>
          </StylePopover>

          {/* Text Styles (only if element has text) */}
          {hasText && (
            <StylePopover
              icon={<div className="i-ph:text-t text-base" />}
              tooltip="Text Style"
            >
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-accent-500 mb-2">Text Style</h4>
                <NumberInput
                  label="Size"
                  value={textStyles.fontSize}
                  onChange={(v) => handleTextStyleChange('fontSize', v)}
                  placeholder="16"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-bolt-elements-textSecondary w-16">Weight</label>
                  <select
                    value={textStyles.fontWeight}
                    onChange={(e) => handleTextStyleChange('fontWeight', e.target.value)}
                    className={classNames(
                      'flex-1 h-7 px-2 text-xs rounded',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
                      'border border-bolt-elements-borderColor',
                      'focus:outline-none focus:border-accent-500'
                    )}
                  >
                    {FONT_WEIGHT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-bolt-elements-textSecondary w-16">Family</label>
                  <select
                    value={textStyles.fontFamily}
                    onChange={(e) => handleTextStyleChange('fontFamily', e.target.value)}
                    className={classNames(
                      'flex-1 h-7 px-2 text-xs rounded',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
                      'border border-bolt-elements-borderColor',
                      'focus:outline-none focus:border-accent-500'
                    )}
                  >
                    {FONT_FAMILY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-bolt-elements-textSecondary w-16">Color</label>
                  <ColorPicker
                    value={textStyles.color}
                    onChange={(v) => handleTextStyleChange('color', v)}
                  />
                </div>
              </div>
            </StylePopover>
          )}
        </>
      )}

      {/* Separator */}
      <div className="w-px h-6 bg-bolt-elements-borderColor mx-1" />

      {/* Edit in chat button */}
      <button
        onClick={handleEditInChat}
        className={classNames(
          'flex items-center gap-1.5 px-2 py-1 rounded',
          'bg-accent-500 hover:bg-accent-600 text-white',
          'text-xs font-medium transition-colors'
        )}
        title="Edit in chat with AI"
      >
        <div className="i-ph:chat-centered-dots text-sm" />
        <span>Edit in Chat</span>
      </button>
    </div>
  );
});

VisualEditingToolbar.displayName = 'VisualEditingToolbar';

/**
 * Toggle button for enabling/disabling visual editing mode
 */
export const VisualEditingToggle = memo(() => {
  const enabled = useStore(visualEditingEnabled);

  const handleToggle = useCallback(() => {
    visualEditingEnabled.set(!enabled);
  }, [enabled]);

  return (
    <button
      onClick={handleToggle}
      className={classNames(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
        'transition-all duration-200',
        enabled
          ? 'bg-accent-500/20 text-accent-500 border border-accent-500/50'
          : 'bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text border border-bolt-elements-borderColor hover:bg-bolt-elements-button-secondary-backgroundHover'
      )}
      title={enabled ? 'Disable visual editing' : 'Enable visual editing (click to select components)'}
    >
      <div className={classNames('i-ph:cursor-click text-sm', enabled && 'animate-pulse')} />
      <span>{enabled ? 'Editing' : 'Edit'}</span>
    </button>
  );
});

VisualEditingToggle.displayName = 'VisualEditingToggle';
