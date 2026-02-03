'use client';

import { motion, AnimatePresence } from 'framer-motion';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { Globe, FileText, Code, Shield, Zap, Database, CheckCircle2, XCircle, Loader2, AlertCircle, Bot, Sparkles, FileCode, Network, Info, Eye, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import ScoreChart from './ScoreChart';
import RadarChart from './RadarChart';
import MetricBars from './MetricBars';

export interface CheckItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  status: 'pending' | 'checking' | 'pass' | 'fail' | 'warning';
  score?: number;
  details?: string;
  recommendation?: string;
  actionItems?: string[];
  tooltip?: string;
  isAI?: boolean;
  isLoading?: boolean;
}

interface ControlPanelProps {
  isAnalyzing: boolean;
  showResults: boolean;
  url: string;
  analysisData?: {
    checks?: CheckItem[];
    overallScore?: number;
    autoStartAI?: boolean;
    aiAnalysisPromise?: Promise<Response>;
    htmlContent?: string;
  };
  onReset: () => void;
  onAIAnalysis?: (url: string, htmlContent: string, checks: CheckItem[]) => Promise<{
    success: boolean;
    insights?: CheckItem[];
  }>;
}

// Default checks configuration
const defaultChecks: CheckItem[] = [
  {
    id: 'heading-structure',
    label: 'Heading Hierarchy',
    description: 'H1-H6 structure',
    icon: FileText,
    status: 'pending'
  },
  {
    id: 'readability',
    label: 'Readability',
    description: 'Content clarity',
    icon: Globe,
    status: 'pending'
  },
  {
    id: 'meta-tags',
    label: 'Metadata Quality',
    description: 'Title, desc, author',
    icon: FileCode,
    status: 'pending'
  },
  {
    id: 'semantic-html',
    label: 'Semantic HTML',
    description: 'Proper HTML5 tags',
    icon: Code,
    status: 'pending'
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    description: 'Alt text & ARIA',
    icon: Eye,
    status: 'pending'
  },
  {
    id: 'llms-txt',
    label: 'LLMs.txt',
    description: 'AI permissions',
    icon: Bot,
    status: 'pending'
  },
  {
    id: 'robots-txt',
    label: 'Robots.txt',
    description: 'Crawler rules',
    icon: Shield,
    status: 'pending'
  },
  {
    id: 'sitemap',
    label: 'Sitemap',
    description: 'Site structure',
    icon: Network,
    status: 'pending'
  }
];

// AI Loading placeholders
const aiLoadingPlaceholders = [
  { id: 'ai-loading-0', label: 'Content Quality for AI', description: 'Analyzing content signal ratio...', icon: Sparkles },
  { id: 'ai-loading-1', label: 'Information Architecture', description: 'Evaluating page structure...', icon: Bot },
  { id: 'ai-loading-2', label: 'Crawlability Patterns', description: 'Checking JavaScript usage...', icon: Database },
  { id: 'ai-loading-3', label: 'AI Training Value', description: 'Assessing training potential...', icon: Network },
  { id: 'ai-loading-4', label: 'Knowledge Extraction', description: 'Analyzing entity definitions...', icon: FileCode },
  { id: 'ai-loading-5', label: 'Template Quality', description: 'Reviewing semantic structure...', icon: Shield },
  { id: 'ai-loading-6', label: 'Content Depth', description: 'Measuring content richness...', icon: Zap },
  { id: 'ai-loading-7', label: 'Machine Readability', description: 'Testing extraction reliability...', icon: Globe }
];

export default function ControlPanel({
  isAnalyzing,
  showResults,
  url,
  analysisData,
  onReset,
  onAIAnalysis
}: ControlPanelProps) {
  const [aiInsights, setAiInsights] = useState<CheckItem[]>([]);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [combinedChecks, setCombinedChecks] = useState<CheckItem[]>([]);
  const [checks, setChecks] = useState<CheckItem[]>(defaultChecks);
  const [overallScore, setOverallScore] = useState(0);
  const [currentCheckIndex, setCurrentCheckIndex] = useState(-1);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [hoveredCheck, setHoveredCheck] = useState<string | null>(null);
  const [enhancedScore, setEnhancedScore] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'chart' | 'bars'>('grid');

  useEffect(() => {
    if (analysisData?.checks && showResults) {
      // Use real data from API
      const mappedChecks = analysisData.checks.map((check) => ({
        ...check,
        icon: defaultChecks.find(c => c.id === check.id)?.icon || FileText,
        description: check.details || defaultChecks.find(c => c.id === check.id)?.description || ''
      }));
      setChecks(mappedChecks);
      setCombinedChecks(mappedChecks);
      setOverallScore(analysisData.overallScore || 0);
      setCurrentCheckIndex(-1);

      // Handle auto-start AI analysis
      if (analysisData.autoStartAI && analysisData.aiAnalysisPromise) {
        handleAutoStartAI(analysisData.aiAnalysisPromise);
      }
    } else if (isAnalyzing) {
      // Reset all checks when starting analysis
      const resetChecks = defaultChecks.map(check => ({ ...check, status: 'pending' as const }));
      setChecks(resetChecks);
      setCombinedChecks(resetChecks);
      setCurrentCheckIndex(0);
      setOverallScore(0);

      // Visual animation while waiting for real results
      const checkInterval = setInterval(() => {
        setCurrentCheckIndex(prev => {
          if (prev >= defaultChecks.length - 1) {
            clearInterval(checkInterval);
            return prev;
          }
          return prev + 1;
        });
      }, 200);

      return () => clearInterval(checkInterval);
    }
  }, [isAnalyzing, showResults, analysisData]);

  useEffect(() => {
    if (currentCheckIndex >= 0 && currentCheckIndex < checks.length && isAnalyzing) {
      // Mark current as checking during animation
      setChecks(prev => prev.map((check, index) => {
        if (index === currentCheckIndex) {
          return { ...check, status: 'checking' as const };
        }
        if (index < currentCheckIndex) {
          return { ...check, status: 'checking' as const };
        }
        return check;
      }));

      setCombinedChecks(prev => prev.map((check, index) => {
        if (index === currentCheckIndex) {
          return { ...check, status: 'checking' as const };
        }
        if (index < currentCheckIndex) {
          return { ...check, status: 'checking' as const };
        }
        return check;
      }));
    }
  }, [currentCheckIndex, checks.length, isAnalyzing]);

  const handleAutoStartAI = async (aiPromise: Promise<Response>) => {
    setIsAnalyzingAI(true);
    addAILoadingTiles();

    try {
      const aiResponse = await aiPromise;
      if (aiResponse) {
        const data = await aiResponse.json() as { success?: boolean; insights?: unknown };
        if (data.success && data.insights) {
          processAIInsights(data.insights as CheckItem[]);
        }
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      setCombinedChecks(prev => prev.filter(c => !c.isLoading));
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const addAILoadingTiles = () => {
    const placeholders: CheckItem[] = aiLoadingPlaceholders.map(p => ({
      ...p,
      status: 'checking' as const,
      score: 0,
      isAI: true,
      isLoading: true
    }));

    placeholders.forEach((check, idx) => {
      setTimeout(() => {
        setCombinedChecks(prev => [...prev, check]);
      }, 100 * (idx + 1));
    });
  };

  const processAIInsights = (insights: CheckItem[]) => {
    const aiIcons = [Sparkles, Bot, Database, Network, FileCode, Shield, Zap, Globe];
    const aiChecks: CheckItem[] = insights.map((insight, idx) => ({
      ...insight,
      icon: aiIcons[idx % 8],
      description: insight.details?.substring(0, 60) + '...' || 'AI Analysis',
      isAI: true
    }));

    setAiInsights(aiChecks);

    // Replace loading tiles with real AI tiles
    setCombinedChecks(prev => {
      const withoutLoading = prev.filter(c => !c.isLoading);
      return [...withoutLoading, ...aiChecks];
    });

    // Calculate enhanced score
    if (insights.length > 0) {
      const aiScores = insights.map(i => i.score || 0);
      const avgAiScore = aiScores.reduce((a, b) => a + b, 0) / aiScores.length;
      const combinedScore = Math.round((overallScore * 0.6) + (avgAiScore * 0.4));
      setEnhancedScore(combinedScore);
    }
  };

  const handleAIAnalysis = async () => {
    if (!onAIAnalysis) return;

    setIsAnalyzingAI(true);
    addAILoadingTiles();

    try {
      const result = await onAIAnalysis(url, analysisData?.htmlContent || '', checks);
      if (result.success && result.insights) {
        processAIInsights(result.insights);
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      setCombinedChecks(prev => prev.filter(c => !c.isLoading));
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const getStatusIcon = (status: CheckItem['status']) => {
    switch (status) {
      case 'checking':
        return <Loader2 className="w-10 h-10 text-accent-500 animate-spin" />;
      case 'pass':
        return <CheckCircle2 className="w-10 h-10 text-green-500" />;
      case 'fail':
        return <XCircle className="w-10 h-10 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-10 h-10 text-accent-500" />;
      default:
        return <div className="w-10 h-10 rounded-full border border-bolt-elements-borderColor" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-5xl mx-auto"
    >
      {/* Header */}
      <motion.div
        className="text-center mb-12 pt-6 md:pt-0"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-2xl font-bold text-bolt-elements-textPrimary mb-3">AI Readiness Analysis</h2>
        <p className="text-base text-bolt-elements-textTertiary">Single-page snapshot of {url}</p>

        {showResults && (
          <>
            {/* View Mode Toggle */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 mb-5 flex justify-center gap-2"
            >
              {(['grid', 'chart', 'bars'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    viewMode === mode
                      ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary shadow-md'
                      : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
                  }`}
                >
                  {mode === 'grid' ? 'Grid View' : mode === 'chart' ? 'Radar Chart' : 'Bar Chart'}
                </button>
              ))}
            </motion.div>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.5 }}
              className="flex justify-center"
            >
              <ScoreChart
                score={enhancedScore > 0 ? enhancedScore : overallScore}
                enhanced={enhancedScore > 0}
                size={180}
              />
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10 px-4 relative">
          {combinedChecks.map((check, index) => {
            const isActive = index === currentCheckIndex;
            const IconComponent = check.icon;

            return (
              <motion.div
                key={check.id}
                initial={check.isAI ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: 1,
                  scale: isActive ? 1.05 : 1
                }}
                transition={{
                  delay: check.isAI ? 0 : index * 0.1,
                  scale: { type: 'spring', stiffness: 300 }
                }}
                className={`
                  relative p-4 rounded-lg transition-all bg-bolt-elements-background-depth-2 border
                  ${check.isAI ? 'border-accent-300 bg-gradient-to-br from-bolt-elements-background-depth-2 to-accent-50 dark:to-accent-950' : 'border-bolt-elements-borderColor'}
                  ${isActive ? 'border-accent-500 shadow-lg' : ''}
                  ${check.status !== 'pending' && check.status !== 'checking' ? 'cursor-pointer hover:shadow-md' : ''}
                  ${check.isLoading ? 'animate-pulse' : ''}
                `}
                onClick={() => {
                  if (check.status !== 'pending' && check.status !== 'checking') {
                    setSelectedCheck(selectedCheck === check.id ? null : check.id);
                  }
                }}
                onMouseEnter={() => setHoveredCheck(check.id)}
                onMouseLeave={() => setHoveredCheck(null)}
              >
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <IconComponent className="w-5 h-5 text-bolt-elements-textTertiary" />
                    {getStatusIcon(check.status)}
                  </div>

                  <h3 className="text-sm font-medium mb-1 text-bolt-elements-textPrimary flex items-center gap-1.5">
                    {check.label}
                    {check.tooltip && !aiInsights.some(ai => ai.id === check.id) && (
                      <div className="relative inline-block">
                        <Info className="w-3.5 h-3.5 text-bolt-elements-textTertiary hover:text-bolt-elements-textTertiary transition-colors" />
                        <AnimatePresence>
                          {hoveredCheck === check.id && (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 5 }}
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary text-xs rounded-md shadow-lg z-50 pointer-events-none"
                            >
                              {check.tooltip}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-bolt-elements-background-depth-3" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </h3>

                  <p className="text-xs text-bolt-elements-textTertiary">
                    {check.description}
                  </p>

                  {check.status !== 'pending' && check.status !== 'checking' && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2"
                      >
                        <div className="h-1 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
                          <motion.div
                            className={`
                              h-full rounded-full
                              ${check.status === 'pass' ? 'bg-green-500' : ''}
                              ${check.status === 'warning' ? 'bg-accent-500' : ''}
                              ${check.status === 'fail' ? 'bg-red-500' : ''}
                            `}
                            initial={{ width: 0 }}
                            animate={{ width: `${check.score}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-[10px] text-bolt-elements-textTertiary mt-1 text-center"
                      >
                        Click for details
                      </motion.div>
                    </>
                  )}
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {selectedCheck === check.id && check.details && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="mt-3 pt-3 border-t border-bolt-elements-borderColor"
                    >
                      <div className="space-y-1.5">
                        <div>
                          <div className="text-xs font-medium text-bolt-elements-textTertiary mb-0.5">Status</div>
                          <div className="text-xs text-bolt-elements-textPrimary">{check.details}</div>
                        </div>
                        {check.recommendation && (
                          <div>
                            <div className="text-xs font-medium text-bolt-elements-textTertiary mb-0.5">Recommendation</div>
                            <div className="text-xs text-bolt-elements-textTertiary">{check.recommendation}</div>
                            {check.actionItems && check.actionItems.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {check.actionItems.map((item, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-bolt-elements-textTertiary">
                                    <span className="text-accent-500 mt-0.5">-</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Radar Chart View */}
      {viewMode === 'chart' && showResults && (
        <div>
          <motion.div
            className="flex justify-center gap-10 mb-10"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Basic Analysis Chart */}
            <div className="flex flex-col items-center">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-4">Basic Analysis</h3>
              <RadarChart
                data={checks
                  .filter(check => check.status !== 'pending' && check.status !== 'checking')
                  .slice(0, 8)
                  .map(check => ({
                    label: check.label.length > 12 ? check.label.substring(0, 12) + '...' : check.label,
                    score: check.score || 0
                  }))}
                size={350}
              />
              <div className="mt-4 text-center">
                <div className="text-2xl font-bold text-bolt-elements-textPrimary">{overallScore}%</div>
                <div className="text-xs text-bolt-elements-textTertiary">Overall Score</div>
              </div>
            </div>

            {/* VS Indicator */}
            {aiInsights.length > 0 && (
              <motion.div
                className="flex items-center"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
              >
                <div className="text-sm font-medium text-bolt-elements-textTertiary">VS</div>
              </motion.div>
            )}

            {/* AI Analysis Chart */}
            {aiInsights.length > 0 && (
              <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h3 className="text-sm font-medium text-accent-500 mb-4">AI Enhanced Analysis</h3>
                <RadarChart
                  data={aiInsights
                    .filter(check => check.status !== 'pending' && check.status !== 'checking')
                    .slice(0, 8)
                    .map(check => ({
                      label: check.label.length > 12 ? check.label.substring(0, 12) + '...' : check.label,
                      score: check.score || 0
                    }))}
                  size={350}
                  color="#F79009"
                />
                <div className="mt-4 text-center">
                  <div className="text-2xl font-bold text-accent-500">
                    {Math.round(aiInsights.reduce((sum, check) => sum + (check.score || 0), 0) / aiInsights.length)}%
                  </div>
                  <div className="text-xs text-accent-400">AI Score</div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Comparison Summary */}
          {aiInsights.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-center mb-5"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-50 rounded-lg">
                <span className="text-sm text-bolt-elements-textPrimary">
                  AI analysis found {aiInsights.filter(i => i.score && i.score < 50).length} additional areas for improvement
                </span>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Bar Chart View */}
      {viewMode === 'bars' && showResults && (
        <motion.div
          className="px-10 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <MetricBars
            metrics={combinedChecks
              .filter(check => check.status !== 'pending' && check.status !== 'checking')
              .map(check => ({
                label: check.label,
                score: check.score || 0,
                status: check.status as 'pass' | 'warning' | 'fail',
                category: check.isAI ? 'ai' :
                  ['robots-txt', 'sitemap', 'llms-txt'].includes(check.id) ? 'domain' : 'page',
                details: check.details,
                recommendation: check.recommendation,
                actionItems: check.actionItems
              }))}
          />
        </motion.div>
      )}

      {/* Action Buttons */}
      {showResults && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex gap-3 justify-center"
        >
          <button
            onClick={onReset}
            className="px-5 py-2.5 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3 rounded-lg text-sm font-medium transition-all"
          >
            Analyze Another Site
          </button>
          {onAIAnalysis && (
            <button
              onClick={handleAIAnalysis}
              disabled={isAnalyzingAI}
              className="px-5 py-2.5 bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              {isAnalyzingAI ? 'Analyzing...' : 'Analyze with AI'}
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
