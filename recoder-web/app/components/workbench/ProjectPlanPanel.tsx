import { useState, useMemo } from 'react';
import type { FileMap } from '~/lib/stores/files';

// Icon components using UnoCSS classes (Cloudflare Workers compatible)
const FileCode = ({ className }: { className?: string }) => <div className={`i-ph:file-code ${className || ''}`} />;
const Database = ({ className }: { className?: string }) => <div className={`i-ph:database ${className || ''}`} />;
const Server = ({ className }: { className?: string }) => <div className={`i-ph:hard-drives ${className || ''}`} />;
const Globe = ({ className }: { className?: string }) => <div className={`i-ph:globe ${className || ''}`} />;
const Shield = ({ className }: { className?: string }) => <div className={`i-ph:shield ${className || ''}`} />;
const Layers = ({ className }: { className?: string }) => <div className={`i-ph:stack ${className || ''}`} />;
const Gear = ({ className }: { className?: string }) => <div className={`i-ph:gear ${className || ''}`} />;
const ChevronDown = ({ className }: { className?: string }) => <div className={`i-ph:caret-down ${className || ''}`} />;
const ChevronRight = ({ className }: { className?: string }) => <div className={`i-ph:caret-right ${className || ''}`} />;

interface ProjectPlanPanelProps {
  files: FileMap;
  projectName?: string;
  onFileSelect?: (path: string) => void;
}

interface ArchitectureComponent {
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'api' | 'config' | 'test' | 'docs';
  files: string[];
  description: string;
}

interface ProjectStats {
  totalFiles: number;
  totalFolders: number;
  languages: Record<string, number>;
  size: string;
}

const TYPE_ICONS: Record<string, any> = {
  frontend: Globe,
  backend: Server,
  database: Database,
  api: Layers,
  config: Gear,
  test: Shield,
  docs: FileCode,
};

const TYPE_COLORS: Record<string, string> = {
  frontend: 'text-blue-400',
  backend: 'text-green-400',
  database: 'text-purple-400',
  api: 'text-orange-400',
  config: 'text-bolt-elements-textTertiary',
  test: 'text-yellow-400',
  docs: 'text-cyan-400',
};

export function ProjectPlanPanel({ files, projectName, onFileSelect }: ProjectPlanPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['architecture', 'stats']));
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const stats = useMemo<ProjectStats>(() => {
    const filePaths = Object.keys(files);
    const languages: Record<string, number> = {};
    let totalSize = 0;

    filePaths.forEach(path => {
      const ext = path.split('.').pop()?.toLowerCase() || 'other';
      const entry = files[path];
      const content = entry?.type === 'file' ? entry.content : '';
      totalSize += content.length;

      const langMap: Record<string, string> = {
        ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
        py: 'Python', rs: 'Rust', go: 'Go', java: 'Java',
        css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON',
        md: 'Markdown', yaml: 'YAML', yml: 'YAML',
      };
      const lang = langMap[ext] || ext.toUpperCase();
      languages[lang] = (languages[lang] || 0) + 1;
    });

    const folders = new Set(filePaths.map(p => p.split('/').slice(0, -1).join('/')).filter(Boolean));

    return {
      totalFiles: filePaths.length,
      totalFolders: folders.size,
      languages,
      size: totalSize > 1024 * 1024 
        ? `${(totalSize / 1024 / 1024).toFixed(1)} MB`
        : `${(totalSize / 1024).toFixed(1)} KB`,
    };
  }, [files]);

  const architecture = useMemo<ArchitectureComponent[]>(() => {
    const filePaths = Object.keys(files);
    const components: ArchitectureComponent[] = [];

    // Detect frontend
    const frontendFiles = filePaths.filter(p => 
      p.includes('/components/') || p.includes('/pages/') || p.includes('/app/') ||
      p.match(/\.(tsx|jsx)$/) && !p.includes('server') && !p.includes('api')
    );
    if (frontendFiles.length > 0) {
      components.push({
        name: 'Frontend',
        type: 'frontend',
        files: frontendFiles.slice(0, 10),
        description: `${frontendFiles.length} UI components`,
      });
    }

    // Detect backend/API
    const apiFiles = filePaths.filter(p => 
      p.includes('/api/') || p.includes('/routes/') || p.includes('server.')
    );
    if (apiFiles.length > 0) {
      components.push({
        name: 'API Routes',
        type: 'api',
        files: apiFiles.slice(0, 10),
        description: `${apiFiles.length} endpoints`,
      });
    }

    // Detect database
    const dbFiles = filePaths.filter(p => 
      p.includes('prisma') || p.includes('schema') || p.includes('migration') ||
      p.includes('database') || p.includes('.sql')
    );
    if (dbFiles.length > 0) {
      components.push({
        name: 'Database',
        type: 'database',
        files: dbFiles,
        description: `${dbFiles.length} schema files`,
      });
    }

    // Detect config
    const configFiles = filePaths.filter(p => 
      p.match(/\.(json|yaml|yml|toml|env)$/) || p.includes('config')
    );
    if (configFiles.length > 0) {
      components.push({
        name: 'Configuration',
        type: 'config',
        files: configFiles.slice(0, 10),
        description: `${configFiles.length} config files`,
      });
    }

    // Detect tests
    const testFiles = filePaths.filter(p => 
      p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__')
    );
    if (testFiles.length > 0) {
      components.push({
        name: 'Tests',
        type: 'test',
        files: testFiles.slice(0, 10),
        description: `${testFiles.length} test files`,
      });
    }

    return components;
  }, [files]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-bolt-elements-borderColor">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-orange-500" />
          Project Architecture
        </h3>
        {projectName && (
          <p className="text-xs text-bolt-elements-textSecondary mt-1">{projectName}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Stats Section */}
        <div className="border-b border-bolt-elements-borderColor">
          <button
            onClick={() => toggleSection('stats')}
            className="w-full p-3 flex items-center justify-between hover:bg-bolt-elements-background-depth-2"
          >
            <span className="text-xs font-medium text-bolt-elements-textSecondary">PROJECT STATS</span>
            {expandedSections.has('stats') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSections.has('stats') && (
            <div className="px-3 pb-3 grid grid-cols-2 gap-2">
              <div className="p-2 bg-bolt-elements-background-depth-2 rounded text-center">
                <div className="text-lg font-bold text-blue-400">{stats.totalFiles}</div>
                <div className="text-xs text-bolt-elements-textSecondary">Files</div>
              </div>
              <div className="p-2 bg-bolt-elements-background-depth-2 rounded text-center">
                <div className="text-lg font-bold text-green-400">{stats.totalFolders}</div>
                <div className="text-xs text-bolt-elements-textSecondary">Folders</div>
              </div>
              <div className="col-span-2 p-2 bg-bolt-elements-background-depth-2 rounded">
                <div className="text-xs text-bolt-elements-textSecondary mb-1">Languages</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.languages).slice(0, 5).map(([lang, count]) => (
                    <span key={lang} className="px-1.5 py-0.5 bg-bolt-elements-background-depth-3 rounded text-xs">
                      {lang}: {count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Architecture Section */}
        <div className="border-b border-bolt-elements-borderColor">
          <button
            onClick={() => toggleSection('architecture')}
            className="w-full p-3 flex items-center justify-between hover:bg-bolt-elements-background-depth-2"
          >
            <span className="text-xs font-medium text-bolt-elements-textSecondary">ARCHITECTURE</span>
            {expandedSections.has('architecture') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expandedSections.has('architecture') && (
            <div className="px-3 pb-3 space-y-2">
              {architecture.length === 0 ? (
                <p className="text-xs text-bolt-elements-textSecondary italic">No files yet</p>
              ) : (
                architecture.map((component) => {
                  const Icon = TYPE_ICONS[component.type];
                  const isExpanded = selectedComponent === component.name;
                  return (
                    <div key={component.name} className="bg-bolt-elements-background-depth-2 rounded overflow-hidden">
                      <button
                        onClick={() => setSelectedComponent(isExpanded ? null : component.name)}
                        className="w-full p-2 flex items-center gap-2 hover:bg-bolt-elements-background-depth-3"
                      >
                        <Icon className={`w-4 h-4 ${TYPE_COLORS[component.type]}`} />
                        <span className="flex-1 text-left text-sm">{component.name}</span>
                        <span className="text-xs text-bolt-elements-textSecondary">{component.description}</span>
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                      {isExpanded && (
                        <div className="px-2 pb-2 space-y-1">
                          {component.files.map((file) => (
                            <button
                              key={file}
                              onClick={() => onFileSelect?.(file)}
                              className="w-full text-left px-2 py-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded truncate"
                            >
                              {file}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
