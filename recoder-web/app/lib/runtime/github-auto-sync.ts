function getChatIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/chat\/([^\/]+)/);
  return match ? match[1] : null;
}

export async function autoSyncToGitHub(chatId: string | null, files: Array<{ path: string; content: string }>) {
  try {
    const id = chatId || getChatIdFromUrl();
    if (!id) return;

    const statusResponse = await fetch(`/api/chat/${id}/github?action=status`);
    const status = await statusResponse.json();
    
    if (!status.connected || !status.autoSync) {
      return;
    }

    const message = `Update ${files.length} file${files.length > 1 ? 's' : ''} via Recoder AI`;

    await fetch(`/api/chat/${id}/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'push',
        files: files.map(f => ({ path: f.path, content: f.content })),
        message,
        branch: status.branch
      })
    });

    console.log(`✅ Auto-synced ${files.length} files to GitHub`);
  } catch (error) {
    console.error('Failed to auto-sync to GitHub:', error);
  }
}
