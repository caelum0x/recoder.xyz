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
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: ['⌘', 'K'], description: 'Quick actions', mac: true },
      { keys: ['Ctrl', 'K'], description: 'Quick actions', windows: true },
      { keys: ['Esc'], description: 'Cancel/Close' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: ['⌘', 'B'], description: 'Toggle sidebar', mac: true },
      { keys: ['Ctrl', 'B'], description: 'Toggle sidebar', windows: true },
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
      <Dialog onClose={onClose} className="max-w-2xl">
        <DialogTitle>
          <div className="flex items-center gap-2">
            <span className="text-2xl">⌨️</span>
            <span>Keyboard Shortcuts</span>
          </div>
        </DialogTitle>
        
        <DialogDescription>
          <div className="text-sm text-bolt-elements-textSecondary mb-4">
            Speed up your workflow with these keyboard shortcuts
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SHORTCUTS.map((section) => (
              <div key={section.category} className="flex flex-col gap-3">
                <h3 className="font-semibold text-bolt-elements-textPrimary text-sm uppercase tracking-wide">
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
                        className="flex items-center justify-between p-2 rounded bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor"
                      >
                        <span className="text-sm text-bolt-elements-textSecondary">
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
          <div className="mt-6 p-4 bg-bolt-elements-background-depth-3 rounded-lg border border-bolt-elements-borderColor">
            <div className="flex items-start gap-2">
              <div className="text-lg flex-shrink-0">💡</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                <strong className="text-bolt-elements-textPrimary">Pro tip:</strong> Most shortcuts work with both Cmd (Mac) and Ctrl (Windows/Linux). 
                Press <kbd className="kdb">Cmd/Ctrl</kbd> + <kbd className="kdb">K</kbd> anytime to open quick actions!
              </div>
            </div>
          </div>

          {/* Close button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text transition-colors"
            >
              Got it!
            </button>
          </div>
        </DialogDescription>
      </Dialog>
    </DialogRoot>
  );
}
