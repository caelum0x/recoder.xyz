import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import type { Theme } from '~/types/theme.js';
import type { EditorSettings } from './CodeMirrorEditor.js';
import type { EditorConfig } from '~/lib/stores/editor-config';

export const darkTheme = EditorView.theme({}, { dark: true });
export const themeSelection = new Compartment();
export const editorConfigCompartment = new Compartment();

export function getTheme(theme: Theme, settings: EditorSettings = {}, editorConfig?: EditorConfig): Extension {
  return [
    getEditorTheme(settings, editorConfig),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    theme === 'dark' ? themeSelection.of([getDarkTheme()]) : themeSelection.of([getLightTheme()]),
    editorConfig?.cleanMode ? editorConfigCompartment.of([getCleanTheme()]) : editorConfigCompartment.of([]),
  ];
}

export function reconfigureTheme(theme: Theme) {
  return themeSelection.reconfigure(theme === 'dark' ? getDarkTheme() : getLightTheme());
}

export function reconfigureCleanMode(cleanMode: boolean) {
  return editorConfigCompartment.reconfigure(cleanMode ? getCleanTheme() : []);
}

/**
 * Clean theme - disables error squiggles and warning indicators
 * Inspired by monaco-editor's "no-errors" theme approach
 */
function getCleanTheme(): Extension {
  return EditorView.theme({
    // Hide error squiggles
    '.cm-lintRange-error': {
      backgroundImage: 'none !important',
      textDecoration: 'none !important',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none !important',
      textDecoration: 'none !important',
    },
    '.cm-lintRange-info': {
      backgroundImage: 'none !important',
      textDecoration: 'none !important',
    },
    '.cm-lintRange-hint': {
      backgroundImage: 'none !important',
      textDecoration: 'none !important',
    },
    // Hide lint gutter markers
    '.cm-lint-marker': {
      display: 'none !important',
    },
    '.cm-lint-marker-error': {
      display: 'none !important',
    },
    '.cm-lint-marker-warning': {
      display: 'none !important',
    },
    // Hide error line highlighting
    '.cm-error-line': {
      backgroundColor: 'transparent !important',
    },
    '.cm-warning-line': {
      backgroundColor: 'transparent !important',
    },
  });
}

function getEditorTheme(settings: EditorSettings, editorConfig?: EditorConfig) {
  const smoothScrolling = editorConfig?.smoothScrolling ?? true;
  const cursorBlinking = editorConfig?.cursorBlinking ?? 'smooth';
  const scrollbarStyle = editorConfig?.scrollbarStyle ?? 'thin';
  const scrollbarSize = editorConfig?.scrollbarSize ?? 8;

  // Cursor animation styles based on blinking mode
  const cursorAnimation = getCursorAnimation(cursorBlinking);

  // Scrollbar styles based on scrollbar style setting
  const scrollbarStyles = getScrollbarStyles(scrollbarStyle, scrollbarSize);

  return EditorView.theme({
    '&': {
      fontSize: settings.fontSize ?? '12px',
    },
    '&.cm-editor': {
      height: '100%',
      background: 'var(--cm-backgroundColor)',
      color: 'var(--cm-textColor)',
    },
    '.cm-cursor': {
      borderLeft: 'var(--cm-cursor-width) solid var(--cm-cursor-backgroundColor)',
      ...cursorAnimation,
    },
    '.cm-scroller': {
      lineHeight: '1.5',
      scrollBehavior: smoothScrolling ? 'smooth' : 'auto',
      '&:focus-visible': {
        outline: 'none',
      },
      ...scrollbarStyles,
    },
    '.cm-line': {
      padding: '0 0 0 4px',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'var(--cm-selection-backgroundColorFocused) !important',
      opacity: 'var(--cm-selection-backgroundOpacityFocused, 0.3)',
    },
    '&:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'var(--cm-selection-backgroundColorBlured)',
      opacity: 'var(--cm-selection-backgroundOpacityBlured, 0.3)',
    },
    '&.cm-focused > .cm-scroller .cm-matchingBracket': {
      backgroundColor: 'var(--cm-matching-bracket, rgba(255, 215, 0, 0.3))',
      outline: '1px solid var(--cm-matching-bracket-outline, rgba(255, 215, 0, 0.6))',
      borderRadius: '2px',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--cm-matching-bracket, rgba(255, 215, 0, 0.2))',
    },
    '.cm-nonmatchingBracket': {
      backgroundColor: 'var(--cm-nonmatching-bracket, rgba(255, 0, 0, 0.3))',
      outline: '1px solid var(--cm-nonmatching-bracket-outline, rgba(255, 0, 0, 0.6))',
      borderRadius: '2px',
    },
    '.cm-activeLine': {
      background: 'var(--cm-activeLineBackgroundColor)',
    },
    '.cm-gutters': {
      background: 'var(--cm-gutter-backgroundColor)',
      borderRight: 0,
      color: 'var(--cm-gutter-textColor)',
    },
    '.cm-gutter': {
      '&.cm-lineNumbers': {
        fontFamily: 'Roboto Mono, monospace',
        fontSize: settings.gutterFontSize ?? settings.fontSize ?? '12px',
        minWidth: '40px',
      },
      '& .cm-activeLineGutter': {
        background: 'transparent',
        color: 'var(--cm-gutter-activeLineTextColor)',
      },
      '&.cm-foldGutter .cm-gutterElement > .fold-icon': {
        cursor: 'pointer',
        color: 'var(--cm-foldGutter-textColor)',
        transform: 'translateY(2px)',
        '&:hover': {
          color: 'var(--cm-foldGutter-textColorHover)',
        },
      },
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
    },
    '.cm-tooltip-autocomplete': {
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      maxHeight: '300px',
      overflow: 'auto',
    },
    '.cm-tooltip-autocomplete > ul': {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
      fontSize: '12px',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      minHeight: '22px',
      padding: '2px 8px 2px 4px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon': {
      width: '16px',
      height: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      opacity: 0.8,
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-function': {
      color: '#dcdcaa',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-method': {
      color: '#dcdcaa',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-class': {
      color: '#4ec9b0',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-interface': {
      color: '#4ec9b0',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-variable': {
      color: '#9cdcfe',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-property': {
      color: '#9cdcfe',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-constant': {
      color: '#4fc1ff',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-keyword': {
      color: '#c586c0',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-snippet': {
      color: '#ce9178',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-text': {
      color: '#d4d4d4',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-type': {
      color: '#4ec9b0',
    },
    '.cm-tooltip-autocomplete .cm-completionIcon-enum': {
      color: '#b5cea8',
    },
    '.cm-tooltip-autocomplete .cm-completionLabel': {
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '.cm-tooltip-autocomplete .cm-completionDetail': {
      marginLeft: 'auto',
      paddingLeft: '8px',
      fontStyle: 'italic',
      opacity: 0.7,
      fontSize: '11px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '200px',
    },
    '.cm-tooltip-autocomplete .cm-completionMatchedText': {
      fontWeight: 600,
      color: 'var(--cm-autocomplete-matchColor, #569cd6)',
    },
    '.cm-panel.cm-search label': {
      marginLeft: '2px',
      fontSize: '12px',
    },
    '.cm-panel.cm-search .cm-button': {
      fontSize: '12px',
    },
    '.cm-panel.cm-search .cm-textfield': {
      fontSize: '12px',
    },
    '.cm-panel.cm-search input[type=checkbox]': {
      position: 'relative',
      transform: 'translateY(2px)',
      marginRight: '4px',
    },
    '.cm-panels': {
      borderColor: 'var(--cm-panels-borderColor)',
    },
    '.cm-panels-bottom': {
      borderTop: '1px solid var(--cm-panels-borderColor)',
      backgroundColor: 'transparent',
    },
    '.cm-panel.cm-search': {
      background: 'var(--cm-search-backgroundColor)',
      color: 'var(--cm-search-textColor)',
      padding: '8px',
    },
    '.cm-search .cm-button': {
      background: 'var(--cm-search-button-backgroundColor)',
      borderColor: 'var(--cm-search-button-borderColor)',
      color: 'var(--cm-search-button-textColor)',
      borderRadius: '4px',
      '&:hover': {
        color: 'var(--cm-search-button-textColorHover)',
      },
      '&:focus-visible': {
        outline: 'none',
        borderColor: 'var(--cm-search-button-borderColorFocused)',
      },
      '&:hover:not(:focus-visible)': {
        background: 'var(--cm-search-button-backgroundColorHover)',
        borderColor: 'var(--cm-search-button-borderColorHover)',
      },
      '&:hover:focus-visible': {
        background: 'var(--cm-search-button-backgroundColorHover)',
        borderColor: 'var(--cm-search-button-borderColorFocused)',
      },
    },
    '.cm-panel.cm-search [name=close]': {
      top: '6px',
      right: '6px',
      padding: '0 6px',
      fontSize: '1rem',
      backgroundColor: 'var(--cm-search-closeButton-backgroundColor)',
      color: 'var(--cm-search-closeButton-textColor)',
      '&:hover': {
        'border-radius': '6px',
        color: 'var(--cm-search-closeButton-textColorHover)',
        backgroundColor: 'var(--cm-search-closeButton-backgroundColorHover)',
      },
    },
    '.cm-search input': {
      background: 'var(--cm-search-input-backgroundColor)',
      borderColor: 'var(--cm-search-input-borderColor)',
      color: 'var(--cm-search-input-textColor)',
      outline: 'none',
      borderRadius: '4px',
      '&:focus-visible': {
        borderColor: 'var(--cm-search-input-borderColorFocused)',
      },
    },
    '.cm-tooltip': {
      background: 'var(--cm-tooltip-backgroundColor)',
      border: '1px solid transparent',
      borderColor: 'var(--cm-tooltip-borderColor)',
      color: 'var(--cm-tooltip-textColor)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': {
      background: 'var(--cm-tooltip-backgroundColorSelected)',
      color: 'var(--cm-tooltip-textColorSelected)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--cm-searchMatch-backgroundColor)',
    },
    '.cm-tooltip.cm-readonly-tooltip': {
      padding: '4px',
      whiteSpace: 'nowrap',
      backgroundColor: 'var(--bolt-elements-bg-depth-2)',
      borderColor: 'var(--bolt-elements-borderColorActive)',
      '& .cm-tooltip-arrow:before': {
        borderTopColor: 'var(--bolt-elements-borderColorActive)',
      },
      '& .cm-tooltip-arrow:after': {
        borderTopColor: 'transparent',
      },
    },
    // Indent guide styling
    '.cm-indentation-marker': {
      display: 'inline-block',
    },
    '.cm-indentation-marker::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '4px',
      borderLeft: '1px solid var(--cm-indent-guide-color, rgba(255, 255, 255, 0.1))',
    },
    '.cm-indentation-marker.active::before': {
      borderLeftColor: 'var(--cm-indent-guide-active-color, rgba(255, 255, 255, 0.3))',
    },
  });
}

function getLightTheme() {
  return vscodeLight;
}

function getDarkTheme() {
  return vscodeDark;
}

/**
 * Get cursor animation CSS based on blinking mode
 */
function getCursorAnimation(blinking: string): Record<string, string> {
  switch (blinking) {
    case 'smooth':
      return {
        animation: 'cm-cursor-smooth 1.2s ease-in-out infinite',
      };
    case 'phase':
      return {
        animation: 'cm-cursor-phase 0.6s ease-in-out infinite',
      };
    case 'expand':
      return {
        animation: 'cm-cursor-expand 1s ease-in-out infinite',
      };
    case 'blink':
      return {
        animation: 'cm-cursor-blink 1s steps(1) infinite',
      };
    case 'solid':
    default:
      return {};
  }
}

/**
 * Get scrollbar CSS based on style setting
 */
function getScrollbarStyles(style: string, size: number): Record<string, unknown> {
  if (style === 'hidden') {
    return {
      scrollbarWidth: 'none',
      '&::-webkit-scrollbar': {
        display: 'none',
      },
    };
  }

  if (style === 'thin') {
    return {
      scrollbarWidth: 'thin',
      scrollbarColor: 'var(--cm-scrollbar-thumb, rgba(255, 255, 255, 0.2)) transparent',
      '&::-webkit-scrollbar': {
        width: `${size}px`,
        height: `${size}px`,
      },
      '&::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '&::-webkit-scrollbar-thumb': {
        background: 'var(--cm-scrollbar-thumb, rgba(255, 255, 255, 0.2))',
        borderRadius: `${size / 2}px`,
        border: '2px solid transparent',
        backgroundClip: 'padding-box',
      },
      '&::-webkit-scrollbar-thumb:hover': {
        background: 'var(--cm-scrollbar-thumb-hover, rgba(255, 255, 255, 0.35))',
        backgroundClip: 'padding-box',
      },
      '&::-webkit-scrollbar-corner': {
        background: 'transparent',
      },
    };
  }

  // Native scrollbar style
  return {};
}

/**
 * CSS keyframes for cursor animations
 * These should be added to your global CSS file
 *
 * @keyframes cm-cursor-smooth {
 *   0%, 100% { opacity: 1; }
 *   50% { opacity: 0; }
 * }
 *
 * @keyframes cm-cursor-phase {
 *   0%, 100% { opacity: 1; }
 *   50% { opacity: 0.4; }
 * }
 *
 * @keyframes cm-cursor-expand {
 *   0%, 100% { transform: scaleY(1); }
 *   50% { transform: scaleY(0.2); }
 * }
 *
 * @keyframes cm-cursor-blink {
 *   0%, 50% { opacity: 1; }
 *   50.01%, 100% { opacity: 0; }
 * }
 */
