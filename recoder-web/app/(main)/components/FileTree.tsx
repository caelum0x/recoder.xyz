'use client';

/**
 * 📁 File Tree Component
 * Displays project file structure
 */

interface FileTreeProps {
  files: Array<{ path: string; content: string }>;
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
}

export default function FileTree({ files, selectedFile, onFileSelect }: FileTreeProps) {
  // Group files by directory
  const fileTree = files.reduce((acc, file) => {
    const parts = file.path.split('/');
    const fileName = parts[parts.length - 1];
    const dir = parts.slice(0, -1).join('/') || 'root';

    if (!acc[dir]) {
      acc[dir] = [];
    }
    acc[dir].push({ name: fileName, fullPath: file.path });

    return acc;
  }, {} as Record<string, Array<{ name: string; fullPath: string }>>);

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary px-4 text-center">
        No files yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-bolt-elements-background-depth-2 p-2">
      <div className="text-xs font-semibold text-bolt-elements-textTertiary mb-2 px-2">
        PROJECT FILES
      </div>

      {Object.entries(fileTree).map(([dir, dirFiles]) => (
        <div key={dir} className="mb-3">
          {dir !== 'root' && (
            <div className="text-xs text-bolt-elements-textTertiary px-2 mb-1">
              📁 {dir}
            </div>
          )}

          <div className="space-y-0.5">
            {dirFiles.map((file) => (
              <button
                key={file.fullPath}
                onClick={() => onFileSelect(file.fullPath)}
                className={`w-full text-left px-2 py-1.5 text-sm rounded transition-colors ${
                  selectedFile === file.fullPath
                    ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                    : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundHover hover:text-bolt-elements-textPrimary'
                }`}
              >
                <span className="mr-2">
                  {file.name.endsWith('.tsx') || file.name.endsWith('.ts')
                    ? '📘'
                    : file.name.endsWith('.jsx') || file.name.endsWith('.js')
                    ? '📙'
                    : file.name.endsWith('.css')
                    ? '🎨'
                    : file.name.endsWith('.json')
                    ? '📋'
                    : '📄'}
                </span>
                {file.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
