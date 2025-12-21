import { ChatHistoryList } from '~/components/chat/ChatHistoryList';
import { BaseChat } from '~/components/chat/BaseChat';

export default function HistoryPage() {
  return (
    <BaseChat>
      <div className="flex h-full w-full">
        <div className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto p-6">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-3">
                💬 All Chats
              </h1>
              <p className="text-bolt-elements-textSecondary text-lg">
                Browse and continue all your conversations - CLI and Web
              </p>
              <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <p className="text-sm text-purple-400 flex items-center gap-2">
                  <span className="text-base">🎉</span>
                  <span>
                    <strong>New!</strong> CLI chats are now automatically saved.
                    Use the filter tabs above to view CLI-only, Web-only, or all conversations.
                  </span>
                </p>
              </div>
            </div>

            {/* Chat List */}
            <ChatHistoryList />
          </div>
        </div>
      </div>
    </BaseChat>
  );
}
