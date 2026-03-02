import { Dialog, DialogRoot, DialogTitle, DialogDescription } from './Dialog';
import { classNames } from '~/utils/classNames';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    category: 'Chat',
    items: [
      { keys: ['⌘', 'Enter'], description: 'Send message', mac: true },
      { keys: ['Ctrl', 'Enter'], description: 'Send message', windows: true },
      { keys: ['⌘', 'L'], description: 'Clear chat', mac: true },
      { keys: ['Ctrl', 'L'], description: 'Clear chat', windows: true },
      { keys: ['⌘', 'I'], description: 'Focus input', mac: true },
      { keys: ['Ctrl', 'I'], description: 'Focus input', windows: true },
      { keys: ['/'], description: 'Slash commands (type in input)' },
    ],
  },
  {
    category: 'Editor',
    items: [
      { keys: ['⌘', 'S'], description: 'Save file', mac: true },
      { keys: ['Ctrl', 'S'], description: 'Save file', windows: true },
      { keys: ['⌘', 'Z'], description: 'Undo', mac: true },
      { keys: ['Ctrl', 'Z'], description: 'Undo', windows: true },
      { keys: ['⌘', 'Shift', 'Z'], description: 'Redo', mac: true },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo', windows: true },
      { keys: ['⌘', 'F'], description: 'Find in file', mac: true },
      { keys: ['Ctrl', 'F'], description: 'Find in file', windows: true },
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: ['⌘', 'K'], description: 'Inline edit (select code first)', mac: true },
      { keys: ['Ctrl', 'K'], description: 'Inline edit (select code first)', windows: true },
      { keys: ['⌘', 'Shift', 'P'], description: 'Command palette', mac: true },
      { keys: ['Ctrl', 'Shift', 'P'], description: 'Command palette', windows: true },
      { keys: ['⌘', '.'], description: 'Toggle chat mode (Build/Ask/Agent)', mac: true },
      { keys: ['Ctrl', '.'], description: 'Toggle chat mode (Build/Ask/Agent)', windows: true },
      { keys: ['Tab'], description: 'Accept inline completion' },
      { keys: ['Esc'], description: 'Cancel/Close' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: ['⌘', 'B'], description: 'Toggle sidebar', mac: true },
      { keys: ['Ctrl', 'B'], description: 'Toggle sidebar', windows: true },
      { keys: ['⌘', '`'], description: 'Toggle terminal', mac: true },
      { keys: ['Ctrl', '`'], description: 'Toggle terminal', windows: true },
      { keys: ['⌘', 'Shift', 'E'], description: 'File explorer', mac: true },
      { keys: ['Ctrl', 'Shift', 'E'], description: 'File explorer', windows: true },
      { keys: ['⌘', 'Shift', 'F'], description: 'Search in files', mac: true },
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Search in files', windows: true },
      { keys: ['⌘', 'Shift', 'G'], description: 'Git panel', mac: true },
      { keys: ['Ctrl', 'Shift', 'G'], description: 'Git panel', windows: true },
    ],
  },
  {
    category: 'Panels',
    items: [
      { keys: ['⌘', '1'], description: 'Terminal tab', mac: true },
      { keys: ['Ctrl', '1'], description: 'Terminal tab', windows: true },
      { keys: ['⌘', '2'], description: 'Logs tab', mac: true },
      { keys: ['Ctrl', '2'], description: 'Logs tab', windows: true },
      { keys: ['⌘', '3'], description: 'Problems tab', mac: true },
      { keys: ['Ctrl', '3'], description: 'Problems tab', windows: true },
      { keys: ['⌘', '4'], description: 'Secrets tab', mac: true },
      { keys: ['Ctrl', '4'], description: 'Secrets tab', windows: true },
    ],
  },
  {
    category: 'Help',
    items: [
      { keys: ['⌘', '/'], description: 'Show shortcuts', mac: true },
      { keys: ['Ctrl', '/'], description: 'Show shortcuts', windows: true },
    ],
  },
];

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  // Detect if user is on Mac
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return (
    <DialogRoot open={open}>
      <Dialog onClose={onClose} className="max-w-2xl" aria-label="Keyboard shortcuts">
        <DialogTitle>
          <div className="flex items-center gap-2">
            <span className="text-2xl"><div className="i-ph:keyboard" /></span>
            <span>Keyboard Shortcuts</span>
          </div>
        </DialogTitle>
        
        <DialogDescription>
          <div className="text-sm text-recoder-elements-textSecondary mb-4">
            Speed up your workflow with these keyboard shortcuts
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SHORTCUTS.map((section) => (
              <div key={section.category} className="flex flex-col gap-3">
                <h3 className="font-semibold text-recoder-elements-textPrimary text-sm uppercase tracking-wide">
                  {section.category}
                </h3>
                <div className="flex flex-col gap-2">
                  {section.items
                    .filter((item) => {
                      // Show Mac shortcuts on Mac, Windows shortcuts on Windows, or shortcuts without platform
                      if (item.mac && !isMac) return false;
                      if (item.windows && isMac) return false;
                      return true;
                    })
                    .map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor"
                      >
                        <span className="text-sm text-recoder-elements-textSecondary">
                          {item.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((key, keyIndex) => (
                            <kbd
                              key={keyIndex}
                              className="kdb inline-flex items-center justify-center min-w-[24px] px-2"
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div className="mt-6 p-4 bg-recoder-elements-background-depth-3 rounded-lg border border-recoder-elements-borderColor">
            <div className="flex items-start gap-2">
              <div className="text-lg flex-shrink-0"><div className="i-ph:lightbulb" /></div>
              <div className="text-sm text-recoder-elements-textSecondary">
                <strong className="text-recoder-elements-textPrimary">Pro tip:</strong> Select code in the editor and press <kbd className="kdb">Cmd/Ctrl</kbd> + <kbd className="kdb">K</kbd> to edit with AI.
                Use <kbd className="kdb">@</kbd> in chat to reference files, folders, or symbols.
              </div>
            </div>
          </div>

          {/* Close button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-recoder-elements-button-primary-background hover:bg-recoder-elements-button-primary-backgroundHover text-recoder-elements-button-primary-text transition-colors"
              aria-label="Close keyboard shortcuts dialog"
            >
              Got it!
            </button>
          </div>
        </DialogDescription>
      </Dialog>
    </DialogRoot>
  );
}
