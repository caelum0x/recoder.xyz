'use client';

import { motion, AnimatePresence } from 'framer-motion';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { Check, X, FileText, Globe, Code, Sparkles, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InlineResultsProps {
  isAnalyzing: boolean;
  showResults: boolean;
  analysisStep: number;
  url: string;
  onReset: () => void;
  results?: {
    score: number;
    grade: string;
    llmsTxt: boolean;
    robotsTxt: boolean;
    structuredData: boolean;
    semanticHTML: boolean;
    metaTags: boolean;
    accessibility: boolean;
  };
}

const defaultAnalysisSteps = [
  'Fetching website content...',
  'Checking for LLMs.txt...',
  'Analyzing HTML structure...',
  'Calculating AI readiness...'
];

// Default placeholder data for the results
const defaultResults = {
  score: 78,
  grade: 'B+',
  llmsTxt: true,
  robotsTxt: true,
  structuredData: true,
  semanticHTML: false,
  metaTags: true,
  accessibility: true
};

export default function InlineResults({
  isAnalyzing,
  showResults,
  analysisStep,
  url: _url,
  onReset,
  results
}: InlineResultsProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const data = results || defaultResults;

  useEffect(() => {
    if (showResults) {
      // Animate score counting up
      const target = data.score;
      const duration = 1500;
      const increment = target / (duration / 16);
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          setDisplayScore(target);
          clearInterval(timer);
        } else {
          setDisplayScore(Math.floor(current));
        }
      }, 16);

      return () => clearInterval(timer);
    }
  }, [showResults, data.score]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#F79009';
    return '#ef4444';
  };

  return (
    <AnimatePresence mode="wait">
      {/* Analyzing State */}
      {isAnalyzing && (
        <motion.div
          key="analyzing"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="space-y-5"
        >
          {/* Progress Bar */}
          <div className="relative">
            <div className="h-0.5 bg-recoder-elements-background-depth-3 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-accent-500 to-accent-400"
                initial={{ width: '0%' }}
                animate={{ width: `${((analysisStep + 1) / 4) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>

            {/* Glowing dot at the end of progress */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent-500 rounded-full"
              style={{
                left: `${((analysisStep + 1) / 4) * 100}%`,
                boxShadow: '0 0 20px rgba(247, 144, 9, 0.8)'
              }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [1, 0.8, 1]
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity
              }}
            />
          </div>

          {/* Status Text */}
          <motion.div
            key={analysisStep}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-sm text-recoder-elements-textTertiary"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Sparkles className="w-4 h-4 text-accent-500" />
            </motion.div>
            {defaultAnalysisSteps[analysisStep]}
          </motion.div>

          {/* ASCII Animation */}
          <motion.div
            className="font-mono text-xs text-recoder-elements-textSecondary overflow-hidden h-8 relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {'< analyzing />'}
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {/* Results State */}
      {showResults && (
        <motion.div
          key="results"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="space-y-6"
        >
          {/* Score Display */}
          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 200,
                delay: 0.2
              }}
              className="relative inline-block"
            >
              {/* Background glow */}
              <motion.div
                className="absolute inset-0 rounded-full blur-xl"
                style={{ background: getScoreColor(data.score) }}
                animate={{
                  opacity: [0.3, 0.6, 0.3],
                  scale: [0.8, 1.2, 0.8]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity
                }}
              />

              {/* Score circle */}
              <div
                className="relative w-28 h-28 rounded-full flex flex-col items-center justify-center"
                style={{
                  background: `conic-gradient(from 0deg, ${getScoreColor(data.score)} ${displayScore * 3.6}deg, #f0f0f0 ${displayScore * 3.6}deg)`,
                  padding: '4px'
                }}
              >
                <div className="w-full h-full bg-recoder-elements-background-depth-1 rounded-full flex flex-col items-center justify-center">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-3xl font-bold"
                    style={{ color: getScoreColor(data.score) }}
                  >
                    {displayScore}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="text-xs text-recoder-elements-textTertiary"
                  >
                    AI Ready
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Quick Checks Grid */}
          <motion.div
            className="grid grid-cols-3 gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {[
              {
                label: 'LLMs.txt',
                value: data.llmsTxt,
                icon: FileText,
                description: 'AI instructions',
                detail: data.llmsTxt ? 'Found' : 'Missing'
              },
              {
                label: 'Structured Data',
                value: data.structuredData,
                icon: Code,
                description: 'Schema markup',
                detail: data.structuredData ? 'Detected' : 'Not found'
              },
              {
                label: 'Semantic HTML',
                value: data.semanticHTML,
                icon: Globe,
                description: 'HTML5 tags',
                detail: data.semanticHTML ? 'Good' : 'Needs work'
              }
            ].map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + index * 0.1 }}
                className={`
                  relative p-4 rounded-xl transition-all hover:shadow-md cursor-pointer
                  ${item.value
                    ? 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200'
                    : 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200'}
                  border
                `}
              >
                {/* Status indicator */}
                <div className="absolute top-3 right-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 1 + index * 0.1, type: 'spring' }}
                    className={`
                      w-5 h-5 rounded-full flex items-center justify-center
                      ${item.value ? 'bg-green-500' : 'bg-red-500'}
                    `}
                  >
                    {item.value ? (
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    ) : (
                      <X className="w-3 h-3 text-white" strokeWidth={3} />
                    )}
                  </motion.div>
                </div>

                {/* Icon */}
                <div className="mb-3">
                  <item.icon className={`
                    w-5 h-5
                    ${item.value ? 'text-green-600' : 'text-red-600'}
                  `} />
                </div>

                {/* Content */}
                <div className="space-y-1">
                  <div className="text-sm font-medium text-recoder-elements-textPrimary">
                    {item.label}
                  </div>
                  <div className="text-xs text-recoder-elements-textTertiary">
                    {item.description}
                  </div>
                  <div className={`
                    text-xs font-semibold
                    ${item.value ? 'text-green-600' : 'text-red-600'}
                  `}>
                    {item.detail}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Quick Tip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="p-3 bg-accent-50 rounded-lg border border-accent-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-accent-500 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-recoder-elements-textPrimary mb-1">Quick Tip</div>
              <div className="text-xs text-recoder-elements-textTertiary">
                {data.semanticHTML
                  ? 'Your site has good semantic HTML structure for AI understanding.'
                  : 'Add semantic HTML5 elements to improve AI comprehension of your content.'}
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="flex gap-2"
          >
            <button
              onClick={onReset}
              className="flex-1 px-4 py-2.5 bg-recoder-elements-background-depth-2 hover:bg-recoder-elements-background-depth-3 rounded-lg text-sm font-medium transition-all"
            >
              Try Another
            </button>
            <button className="flex-1 px-4 py-2.5 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-medium transition-all shadow-lg hover:shadow-xl">
              View Details
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
