'use client';

/**
 * 🖼️ Preview Component
 * Live preview iframe for WebContainer output
 */

interface PreviewProps {
  url: string | null;
}

export default function Preview({ url }: PreviewProps) {
  if (!url) {
    return (
      <div className="h-full flex items-center justify-center bg-bolt-elements-background-depth-2">
        <div className="text-center">
          <div className="text-bolt-elements-textSecondary mb-2">No preview available</div>
          <div className="text-sm text-bolt-elements-textTertiary">
            Start the dev server to see a live preview
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-white">
      <iframe
        src={url}
        className="h-full w-full border-0"
        title="Preview"
        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
      />
    </div>
  );
}
