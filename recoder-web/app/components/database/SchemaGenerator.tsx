/**
 * Database Schema Generator Component
 * Interactive UI for generating database schemas from natural language
 */

import { useState, useEffect } from 'react';
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('SchemaGenerator');

interface Entity {
  name: string;
  tableName: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    unique: boolean;
    primaryKey: boolean;
    defaultValue?: string;
  }>;
  relationships: Array<{
    type: string;
    targetEntity: string;
    foreignKey?: string;
  }>;
}

interface SchemaResult {
  entities: Entity[];
  schema: {
    sql: string;
    typescript: string;
    prisma?: string;
    drizzle?: string;
  };
  seedData?: {
    sql: string;
    json: Record<string, any[]>;
  };
  summary: {
    entityCount: number;
    totalFields: number;
    relationshipCount: number;
    indexCount: number;
  };
}

interface Example {
  name: string;
  description: string;
  category: string;
}

export default function SchemaGenerator() {
  const [description, setDescription] = useState('');
  const [dbType, setDbType] = useState<'sqlite' | 'postgresql' | 'mysql'>('sqlite');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SchemaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [activeTab, setActiveTab] = useState<'sql' | 'typescript' | 'prisma' | 'seed'>('sql');
  const [copied, setCopied] = useState(false);

  // Load examples
  useEffect(() => {
    fetch('/api/schema')
      .then(res => res.json())
      .then((data) => {
        const typedData = data as { examples?: Example[] };
        setExamples(typedData.examples || []);
      })
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please enter a description');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          dbType,
          format: 'complete',
        }),
      });

      const data = await response.json() as { error?: string; data?: SchemaResult };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate schema');
      }

      setResult(data.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (example: Example) => {
    setDescription(example.description);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImportToProject = async () => {
    if (!result) return;

    try {
      const timestamp = Date.now();

      // Prepare files for import (use clean paths without /home/project)
      const fileMap: Record<string, string> = {};

      fileMap[`schema-${timestamp}.sql`] = result.schema.sql;
      fileMap[`types-${timestamp}.ts`] = result.schema.typescript;

      if (result.schema.prisma) {
        fileMap['schema.prisma'] = result.schema.prisma;
      }

      if (result.seedData) {
        fileMap[`seed-${timestamp}.sql`] = result.seedData.sql;
      }

      const fileCount = Object.keys(fileMap).length;
      const fileList = Object.keys(fileMap).join(', ');

      logger.info('📦 Importing SQL schema files:', fileList);

      // Create prompt for AI to import the schema
      const prompt = `Import this database schema to the project:

Database Type: ${dbType.toUpperCase()}
Files to import (${fileCount} total): ${fileList}

Please create all these files in the project and set up the database configuration. Analyze the schema structure and help set up any necessary database connections or migrations.`;

      // Dispatch the import event (same pattern as GitHub/Templates/Starters)
      window.dispatchEvent(new CustomEvent('recoder:import', {
        detail: {
          prompt,
          files: fileMap,
          repository: {
            name: `SQL Schema (${dbType})`,
            description: `Database schema with ${result.summary.entityCount} entities`,
            language: dbType,
          },
          template: {
            id: 'sql-schema',
            name: `${dbType.toUpperCase()} Schema`,
            description: `Database schema generated with ${result.summary.entityCount} entities, ${result.summary.totalFields} fields, and ${result.summary.relationshipCount} relationships`,
            category: 'database',
            tags: [dbType, 'database', 'schema'],
            featured: false,
          }
        }
      }));

      toast.success(`Importing ${fileCount} schema files to project...`);
      logger.info('✅ SQL schema import event dispatched');

      // Close the schema generator view after brief delay
      setTimeout(() => {
        // Navigate back to main chat (don't use window.location to avoid reload)
        window.history.pushState({}, '', '/');

        // Trigger a custom event for navigation handling
        window.dispatchEvent(new CustomEvent('navigate-home'));
      }, 500);

    } catch (error) {
      toast.error('Failed to import schema files');
      logger.error('❌ Schema import error:', error);
    }
  };

  const handleClose = () => {
    setResult(null);
    setDescription('');
    setError(null);
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCurrentContent = () => {
    if (!result) return '';
    
    switch (activeTab) {
      case 'sql':
        return result.schema.sql;
      case 'typescript':
        return result.schema.typescript;
      case 'prisma':
        return result.schema.prisma || '';
      case 'seed':
        return result.seedData?.sql || '';
      default:
        return '';
    }
  };

  const getCurrentFilename = () => {
    switch (activeTab) {
      case 'sql':
        return 'schema.sql';
      case 'typescript':
        return 'types.ts';
      case 'prisma':
        return 'schema.prisma';
      case 'seed':
        return 'seed.sql';
      default:
        return 'file.txt';
    }
  };

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1 relative">
      {/* Close Button - Shows when result exists */}
      {result && (
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-50 p-2.5 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-2 border-2 border-bolt-elements-borderColor hover:border-red-500 rounded-lg transition-all shadow-xl group"
          title="Close schema view"
        >
          <span className="i-ph:x w-5 h-5 text-bolt-elements-textPrimary group-hover:text-red-500" />
        </button>
      )}

      {/* Header */}
      <div className="border-b border-bolt-elements-borderColor p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
            <span className="i-ph:database w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-bolt-elements-textPrimary">
              Database Schema Generator
            </h1>
            <p className="text-sm text-bolt-elements-textTertiary">
              Generate complete database schemas from natural language descriptions
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Input Section */}
          <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                Describe your database
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Create a blog with users, posts, and comments. Users can write multiple posts, and each post can have many comments."
                className="w-full h-32 px-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Database Type
                </label>
                <select
                  value={dbType}
                  onChange={(e) => setDbType(e.target.value as any)}
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="sqlite">SQLite</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                </select>
              </div>

              <div className="flex-shrink-0 pt-7">
                <button
                  onClick={handleGenerate}
                  disabled={loading || !description.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <>
                      <span className="i-ph:spinner w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <span className="i-ph:sparkle w-4 h-4" />
                      Generate Schema
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Examples */}
            {examples.length > 0 && !result && (
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Quick Examples
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {examples.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleClick(example)}
                      className="text-left px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg hover:border-blue-500 transition-colors"
                    >
                      <div className="text-sm font-medium text-bolt-elements-textPrimary">
                        {example.name}
                      </div>
                      <div className="text-xs text-bolt-elements-textTertiary mt-1">
                        {example.category}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {result.summary.entityCount}
                  </div>
                  <div className="text-sm text-bolt-elements-textTertiary">Entities</div>
                </div>
                <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {result.summary.totalFields}
                  </div>
                  <div className="text-sm text-bolt-elements-textTertiary">Total Fields</div>
                </div>
                <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {result.summary.relationshipCount}
                  </div>
                  <div className="text-sm text-bolt-elements-textTertiary">Relationships</div>
                </div>
                <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4">
                  <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {result.summary.indexCount}
                  </div>
                  <div className="text-sm text-bolt-elements-textTertiary">Indexes</div>
                </div>
              </div>

              {/* Entities List */}
              <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6">
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4 flex items-center gap-2">
                  <span className="i-ph:table w-5 h-5" />
                  Generated Entities
                </h2>
                <div className="space-y-4">
                  {result.entities.map((entity, index) => (
                    <div
                      key={index}
                      className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-bolt-elements-textPrimary">
                            {entity.name}
                          </h3>
                          <p className="text-sm text-bolt-elements-textTertiary">
                            Table: {entity.tableName}
                          </p>
                        </div>
                        <div className="text-sm text-bolt-elements-textTertiary">
                          {entity.fields.length} fields • {entity.relationships.length} relationships
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        {entity.fields.slice(0, 6).map((field, fIndex) => (
                          <div
                            key={fIndex}
                            className="flex items-center gap-2 text-bolt-elements-textTertiary"
                          >
                            <span className="text-bolt-elements-textTertiary">•</span>
                            <span className="font-mono text-xs">{field.name}</span>
                            <span className="text-bolt-elements-textTertiary">:</span>
                            <span className="text-blue-400">{field.type}</span>
                            {field.primaryKey && (
                              <span className="text-xs bg-purple-500/20 text-purple-400 px-1 rounded">
                                PK
                              </span>
                            )}
                            {field.unique && !field.primaryKey && (
                              <span className="text-xs bg-blue-500/20 text-blue-400 px-1 rounded">
                                UNIQUE
                              </span>
                            )}
                          </div>
                        ))}
                        {entity.fields.length > 6 && (
                          <div className="text-bolt-elements-textTertiary text-xs">
                            +{entity.fields.length - 6} more fields...
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Code Output */}
              <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor overflow-hidden">
                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-bolt-elements-borderColor p-2">
                  <button
                    onClick={() => setActiveTab('sql')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'sql'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                        : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
                    }`}
                  >
                    <span className="i-ph:file-code w-4 h-4 inline mr-2" />
                    SQL Schema
                  </button>
                  <button
                    onClick={() => setActiveTab('typescript')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'typescript'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                        : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
                    }`}
                  >
                    <span className="i-ph:file-code w-4 h-4 inline mr-2" />
                    TypeScript
                  </button>
                  {result.schema.prisma && (
                    <button
                      onClick={() => setActiveTab('prisma')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'prisma'
                          ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                          : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
                      }`}
                    >
                      <span className="i-ph:file-code w-4 h-4 inline mr-2" />
                      Prisma
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('seed')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'seed'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                        : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
                    }`}
                  >
                    <span className="i-ph:database w-4 h-4 inline mr-2" />
                    Seed Data
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(getCurrentContent())}
                      className="px-3 py-2 text-sm text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
                    >
                      {copied ? (
                        <span className="i-ph:check w-4 h-4" />
                      ) : (
                        <span className="i-ph:copy w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => downloadFile(getCurrentFilename(), getCurrentContent())}
                      className="px-3 py-2 text-sm text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
                      title="Download file"
                    >
                      <span className="i-ph:download-simple w-4 h-4" />
                    </button>
                    <button
                      onClick={handleImportToProject}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg"
                      title="Import all schema files to your project"
                    >
                      <span className="i-ph:file-code w-4 h-4" />
                      Import to Project
                    </button>
                  </div>
                </div>

                {/* Code Content */}
                <div className="p-4 bg-bolt-elements-background-depth-2">
                  <pre className="text-sm text-bolt-elements-textPrimary overflow-x-auto">
                    <code>{getCurrentContent()}</code>
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
