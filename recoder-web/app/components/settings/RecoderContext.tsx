import { useState, useEffect } from 'react';
import { getAllTemplates } from '~/lib/recoder-context/templates';

interface RecoderContextProps {
  onSave?: (file: string, content: string) => void;
  onLoad?: (file: string) => Promise<string | null>;
}

const RECODER_FILES = [
  { path: 'context.md', label: 'Project Context', icon: '📝' },
  { path: 'spec.md', label: 'Specification', icon: '📋' },
  { path: 'prd.md', label: 'Product Requirements', icon: '🎯' },
  { path: 'architecture.md', label: 'Architecture', icon: '🏗️' },
  { path: 'style-guide.md', label: 'Style Guide', icon: '🎨' },
  { path: 'api-docs.md', label: 'API Documentation', icon: '🔌' },
  { path: 'prompts/component.md', label: 'Component Prompt', icon: '⚛️' },
  { path: 'prompts/api.md', label: 'API Prompt', icon: '🌐' },
  { path: 'prompts/test.md', label: 'Test Prompt', icon: '🧪' },
];

export function RecoderContext({ onSave, onLoad }: RecoderContextProps) {
  const [selectedFile, setSelectedFile] = useState('context.md');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const templates = getAllTemplates();

  useEffect(() => {
    loadFile(selectedFile);
  }, [selectedFile]);

  const loadFile = async (file: string) => {
    if (!onLoad) return;
    const data = await onLoad(file);
    setContent(data || '');
  };

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(selectedFile, content);
      alert('Saved successfully!');
    } catch (error) {
      alert('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const applyTemplate = (templateName: string) => {
    const template = templates.find(t => t.name === templateName);
    if (!template) return;

    // Apply template files
    Object.entries(template.files).forEach(([file, fileContent]) => {
      if (file === selectedFile) {
        setContent(fileContent);
      }
    });

    setShowTemplates(false);
  };

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1">
      <div className="p-4 border-b border-bolt-elements-borderColor">
        <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">
          .recoder/ Project Context
        </h2>
        <p className="text-sm text-bolt-elements-textSecondary">
          Provide project-specific context and guidelines to the AI assistant
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File List */}
        <div className="w-64 border-r border-bolt-elements-borderColor overflow-y-auto">
          <div className="p-2">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="w-full px-3 py-2 mb-2 text-sm bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded hover:bg-bolt-elements-button-primary-backgroundHover"
            >
              📚 Load Template
            </button>

            {showTemplates && (
              <div className="mb-2 p-2 bg-bolt-elements-background-depth-2 rounded">
                {templates.map((template) => (
                  <button
                    key={template.name}
                    onClick={() => applyTemplate(template.name)}
                    className="w-full text-left px-2 py-1 text-sm hover:bg-bolt-elements-background-depth-3 rounded"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            )}

            {RECODER_FILES.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`w-full text-left px-3 py-2 text-sm rounded mb-1 ${
                  selectedFile === file.path
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                    : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                }`}
              >
                <span className="mr-2">{file.icon}</span>
                {file.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-bolt-elements-borderColor flex justify-between items-center">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary">
              {RECODER_FILES.find(f => f.path === selectedFile)?.label}
            </h3>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 p-4 bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary font-mono text-sm resize-none focus:outline-none"
            placeholder="Enter your project context here..."
          />

          <div className="p-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <p className="text-xs text-bolt-elements-textSecondary">
              💡 Tip: This content will be automatically included in AI prompts to provide project-specific context.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
