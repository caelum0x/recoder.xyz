import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { UserMenu } from './UserMenu.client';
import { openSettingsPanel, closeSettingsPanel, settingsPanelOpen } from '~/lib/stores/settings';
import { SettingsPanel } from '~/components/settings/SettingsPanel';
import { openShortcutsPanel, closeShortcutsPanel, shortcutsPanelOpen } from '~/lib/stores/keyboard-shortcuts';
import { KeyboardShortcutsPanel } from '~/components/ui/KeyboardShortcutsPanel';
import { AppSwitcher } from './AppSwitcher';

export function Header() {
  const chat = useStore(chatStore);
  const isSettingsOpen = useStore(settingsPanelOpen);
  const isShortcutsOpen = useStore(shortcutsPanelOpen);

  // Keyboard shortcuts for settings (Cmd+,) and shortcuts panel (Cmd+/ or Cmd+?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+, or Ctrl+, to open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        openSettingsPanel();
      }
      // Cmd+/ or Ctrl+/ to open keyboard shortcuts panel
      // Also handle Cmd+? (which is Shift+/) for "?" key
      if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        openShortcutsPanel();
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        if (isShortcutsOpen) {
          e.preventDefault();
          closeShortcutsPanel();
        } else if (isSettingsOpen) {
          e.preventDefault();
          closeSettingsPanel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, isShortcutsOpen]);

  const handleHistoryToggle = () => {
    // Dispatch custom event to toggle history sidebar
    const event = new CustomEvent('toggle-history');
    window.dispatchEvent(event);
  };

  return (
    <header
      className={classNames(
        'flex items-center bg-recoder-elements-background-depth-1 p-5 border-b h-[var(--header-height)]',
        {
          'border-transparent': !chat.started,
          'border-recoder-elements-borderColor': chat.started,
        },
      )}
    >
      <div className="flex items-center gap-2 z-logo text-recoder-elements-textPrimary">
        {/* History Toggle Button - Black Square with White Icon */}
        <button
          onClick={handleHistoryToggle}
          className="p-2.5 bg-transparent hover:bg-recoder-elements-background-depth-3 rounded-md transition-all"
          title="Toggle Chat History"
          aria-label="Toggle chat history sidebar"
        >
          <div className="i-ph:clock-clockwise text-xl text-recoder-elements-textPrimary" />
        </button>
        
        <a href="/" className="text-2xl font-semibold text-accent flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="Recoder" className="w-8 h-8 rounded" />
          <span className="font-bold hidden sm:inline">Recoder</span>
        </a>
        
        {/* Navigation Links */}
        <nav className="ml-4 hidden md:flex items-center gap-1">
          <a
            href="/projects"
            className="p-2 lg:px-3 lg:py-2 text-sm text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors rounded-md hover:bg-recoder-elements-background-depth-2 flex items-center gap-1"
          >
            <div className="i-ph:folder text-sm" />
            <span className="hidden lg:inline">Projects</span>
          </a>
        </nav>
      </div>
      <span className="flex-1 px-4 truncate text-center text-recoder-elements-textPrimary hidden sm:block">
        <ClientOnly>{() => <ChatDescription />}</ClientOnly>
      </span>
      <div className="flex items-center gap-2">
        {chat.started && (
          <ClientOnly>
            {() => (
              <div className="mr-1">
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        )}
        <AppSwitcher />
        {/* Settings Button */}
        <button
          onClick={openSettingsPanel}
          className="p-2 bg-transparent text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 rounded-md transition-colors"
          title="Settings (Cmd+,)"
          aria-label="Open settings"
        >
          <div className="i-ph:gear text-xl" />
        </button>
        <ClientOnly>
          {() => <UserMenu />}
        </ClientOnly>
      </div>
      {/* Settings Panel */}
      <ClientOnly>
        {() => <SettingsPanel />}
      </ClientOnly>
      {/* Keyboard Shortcuts Panel */}
      <ClientOnly>
        {() => <KeyboardShortcutsPanel />}
      </ClientOnly>
    </header>
  );
}
