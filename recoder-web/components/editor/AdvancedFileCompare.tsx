'use client';

import React, { useState, useEffect } from 'react';
import { 
  GitCompare, ArrowLeft, ArrowRight, Copy, Check, 
  X, RefreshCw, Download, Upload, AlertTriangle,
  ChevronDown, ChevronRight, FileText, Merge,
  History, Users, Clock, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FileChange {
  id: string;
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
  oldPath?: string;
  newContent?: string;
  oldContent?: string;
  additions: number;
  deletions: number;
  binary: boolean;
  timestamp: string;
  author: string;
}

interface DiffChunk {
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

interface AdvancedFileCompareProps {
  projectId: string;
  isVisible: boolean;
  onClose: () => void;
  currentBranch?: string;
}

const AdvancedFileCompare: React.FC<AdvancedFileCompareProps> = ({
  projectId,
  isVisible,
  onClose,
  currentBranch = 'main'
}) => {
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  const [diffChunks, setDiffChunks] = useState<DiffChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [baseBranch, setBaseBranch] = useState('main');
  const [targetBranch, setTargetBranch] = useState('dev');
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());
  const [mergeConflicts, setMergeConflicts] = useState<any[]>([]);
  const [mergeInProgress, setMergeInProgress] = useState(false);
  const [branches, setBranches] = useState<string[]>(['main', 'dev', 'feature/ai-integration']);

  useEffect(() => {
    if (isVisible) {
      loadGitChanges();
      loadBranches();
    }
  }, [isVisible, baseBranch, targetBranch]);

  const loadBranches = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/git/branches`);
      const data = await response.json();
      if (data.success) {
        setBranches(data.branches || ['main', 'dev']);
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  };

  const loadGitChanges = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/git/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base: baseBranch,
          target: targetBranch,
          includeContent: true
        })
      });

      const data = await response.json();
      if (data.success) {
        setChanges(data.changes || []);
      }
    } catch (error) {
      console.error('Failed to load git changes:', error);
    }
    setLoading(false);
  };

  const loadFileDiff = async (change: FileChange) => {
    setComparing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/git/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: change.path,
          base: baseBranch,
          target: targetBranch
        })
      });

      const data = await response.json();
      if (data.success) {
        setDiffChunks(data.chunks || []);
        setSelectedChange(change);
      }
    } catch (error) {
      console.error('Failed to load file diff:', error);
    }
    setComparing(false);
  };

  const performMerge = async (strategy: 'auto' | 'manual' | 'ours' | 'theirs') => {
    setMergeInProgress(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/git/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base: baseBranch,
          target: targetBranch,
          strategy,
          conflictResolutions: mergeConflicts
        })
      });

      const data = await response.json();
      if (data.success) {
        if (data.conflicts) {
          setMergeConflicts(data.conflicts);
        } else {
          // Merge successful
          loadGitChanges();
        }
      }
    } catch (error) {
      console.error('Failed to perform merge:', error);
    }
    setMergeInProgress(false);
  };

  const toggleChunkExpansion = (chunkIndex: number) => {
    const newExpanded = new Set(expandedChunks);
    if (newExpanded.has(chunkIndex)) {
      newExpanded.delete(chunkIndex);
    } else {
      newExpanded.add(chunkIndex);
    }
    setExpandedChunks(newExpanded);
  };

  const getChangeIcon = (type: string) => {
    switch (type) {
      case 'added': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'modified': return <FileText className="h-4 w-4 text-yellow-600" />;
      case 'deleted': return <X className="h-4 w-4 text-red-600" />;
      case 'renamed': return <ArrowRight className="h-4 w-4 text-blue-600" />;
      default: return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getChangeColor = (type: string) => {
    switch (type) {
      case 'added': return 'border-green-500 bg-green-50';
      case 'modified': return 'border-yellow-500 bg-yellow-50';
      case 'deleted': return 'border-red-500 bg-red-50';
      case 'renamed': return 'border-blue-500 bg-blue-50';
      default: return 'border-gray-300';
    }
  };

  const renderDiffLine = (line: DiffLine, lineIndex: number) => {
    const bgColor = line.type === 'add' ? 'bg-green-50' : 
                   line.type === 'remove' ? 'bg-red-50' : 
                   'bg-white';
    const textColor = line.type === 'add' ? 'text-green-800' : 
                     line.type === 'remove' ? 'text-red-800' : 
                     'text-gray-800';
    const borderColor = line.type === 'add' ? 'border-l-green-500' : 
                       line.type === 'remove' ? 'border-l-red-500' : 
                       'border-l-gray-300';

    return (
      <div
        key={lineIndex}
        className={`flex text-sm font-mono border-l-2 ${bgColor} ${borderColor} hover:bg-gray-100`}
      >
        <div className="w-12 px-2 py-1 text-right text-gray-500 bg-gray-50 border-r">
          {line.oldLineNumber || ''}
        </div>
        <div className="w-12 px-2 py-1 text-right text-gray-500 bg-gray-50 border-r">
          {line.newLineNumber || ''}
        </div>
        <div className={`flex-1 px-4 py-1 ${textColor}`}>
          {line.type === 'add' && <span className="text-green-600">+ </span>}
          {line.type === 'remove' && <span className="text-red-600">- </span>}
          {line.type === 'context' && <span className="text-gray-400">  </span>}
          <span className="whitespace-pre">{line.content}</span>
        </div>
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <Dialog open={isVisible} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-blue-600" />
            Advanced File Comparison & Merge Tool
            <Badge variant="secondary" className="ml-auto">
              {changes.length} changes
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Compare branches, review changes, and manage merges with advanced conflict resolution.
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[70vh]">
          {/* Left Panel - File Changes List */}
          <div className="w-80 border-r flex flex-col">
            <div className="p-4 border-b space-y-4">
              <div className="flex gap-2">
                <Select value={baseBranch} onValueChange={setBaseBranch}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Base branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(branch => (
                      <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ArrowRight className="h-4 w-4 self-center text-gray-400" />
                <Select value={targetBranch} onValueChange={setTargetBranch}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Target branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(branch => (
                      <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={loadGitChanges} 
                disabled={loading}
                size="sm" 
                className="w-full"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
                Compare
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {changes.map((change) => (
                    <Card
                      key={change.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedChange?.id === change.id ? 'ring-2 ring-blue-500' : ''
                      } ${getChangeColor(change.type)}`}
                      onClick={() => loadFileDiff(change)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          {getChangeIcon(change.type)}
                          <span className="text-sm font-medium truncate">{change.path}</span>
                        </div>
                        
                        {change.type === 'renamed' && change.oldPath && (
                          <div className="text-xs text-gray-500 mb-2">
                            {change.oldPath} → {change.path}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            +{change.additions}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                            -{change.deletions}
                          </span>
                          <span className="ml-auto">{change.author}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Diff Viewer */}
          <div className="flex-1 flex flex-col">
            {selectedChange ? (
              <>
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {getChangeIcon(selectedChange.type)}
                      <h3 className="font-semibold">{selectedChange.path}</h3>
                      <Badge variant="outline" className="capitalize">
                        {selectedChange.type}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="side-by-side">Side by Side</SelectItem>
                          <SelectItem value="unified">Unified</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowWhitespace(!showWhitespace)}
                      >
                        Whitespace
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>+{selectedChange.additions} additions</span>
                    <span>-{selectedChange.deletions} deletions</span>
                    <span>By {selectedChange.author}</span>
                    <span>{new Date(selectedChange.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  {comparing ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  ) : (
                    <div className="font-mono text-sm">
                      {diffChunks.map((chunk, chunkIndex) => (
                        <div key={chunkIndex} className="border-b">
                          <div
                            className="bg-gray-100 px-4 py-2 text-gray-700 cursor-pointer hover:bg-gray-200 flex items-center gap-2"
                            onClick={() => toggleChunkExpansion(chunkIndex)}
                          >
                            {expandedChunks.has(chunkIndex) ? 
                              <ChevronDown className="h-4 w-4" /> : 
                              <ChevronRight className="h-4 w-4" />
                            }
                            <span>
                              @@ -{chunk.oldStart},{chunk.oldLength} +{chunk.newStart},{chunk.newLength} @@
                            </span>
                          </div>
                          
                          {expandedChunks.has(chunkIndex) && (
                            <div>
                              {chunk.lines.map((line, lineIndex) => renderDiffLine(line, lineIndex))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <GitCompare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Select a file to view the diff</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between p-4 border-t">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => performMerge('auto')}
              disabled={mergeInProgress || changes.length === 0}
              className="gap-2"
            >
              {mergeInProgress ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
              Auto Merge
            </Button>
            
            <Button
              onClick={() => performMerge('manual')}
              disabled={mergeInProgress || changes.length === 0}
              variant="outline"
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              Manual Merge
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdvancedFileCompare;
