'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { ChevronDown } from 'lucide-react';

export interface MetricBarItem {
  label: string;
  score: number;
  status: 'pass' | 'warning' | 'fail';
  category?: 'page' | 'domain' | 'ai';
  details?: string;
  recommendation?: string;
  actionItems?: string[];
}

interface MetricBarsProps {
  metrics: MetricBarItem[];
  showSummary?: boolean;
  maxWidth?: string;
}

export default function MetricBars({
  metrics,
  showSummary = true,
  maxWidth = '800px'
}: MetricBarsProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const getBarColor = (score: number) => {
    if (score >= 80) return 'bg-accent-500';
    if (score >= 60) return 'bg-accent-600';
    if (score >= 40) return 'bg-accent-700';
    return 'bg-accent-800';
  };

  const getBulletColor = () => {
    return 'bg-accent-500';
  };

  const toggleExpanded = (label: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedItems(newExpanded);
  };

  // Sort metrics by score descending
  const sortedMetrics = [...metrics].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-2" style={{ maxWidth }}>
      {sortedMetrics.map((metric, index) => {
        const isExpanded = expandedItems.has(metric.label);

        return (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
            className="space-y-0"
          >
            <div
              className={`grid grid-cols-12 gap-2 items-center p-2 -m-2 rounded-lg cursor-pointer transition-all hover:bg-recoder-elements-background-depth-3 ${
                isExpanded ? 'bg-recoder-elements-background-depth-3' : ''
              }`}
              onClick={() => toggleExpanded(metric.label)}
            >
              {/* Bullet and Label - fixed width */}
              <div className="col-span-4 flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${getBulletColor()}`} />
                <span className="text-sm font-medium text-recoder-elements-textPrimary truncate">{metric.label}</span>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-auto"
                >
                  <ChevronDown className="w-4 h-4 text-recoder-elements-textTertiary" />
                </motion.div>
              </div>

              {/* Bar container - flexible width */}
              <div className="col-span-7 relative">
                <div className="relative h-2 bg-recoder-elements-background-depth-3 rounded-full overflow-hidden">
                  {/* Animated bar */}
                  <motion.div
                    className={`absolute inset-y-0 left-0 ${getBarColor(metric.score)} rounded-full`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(metric.score, 2)}%` }}
                    transition={{
                      delay: 0.2 + index * 0.05,
                      duration: 0.8,
                      ease: 'easeOut'
                    }}
                  >
                    {/* Subtle inner glow */}
                    <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white opacity-10 rounded-full" />
                  </motion.div>

                  {/* Score indicator lines at key thresholds */}
                  {[40, 60, 80].map(threshold => (
                    <div
                      key={threshold}
                      className="absolute top-0 bottom-0 w-px bg-gray-300 opacity-30"
                      style={{ left: `${threshold}%` }}
                    />
                  ))}
                </div>
              </div>

              {/* Score value - fixed width */}
              <div className="col-span-1 text-right">
                <span className="text-sm font-medium text-accent-600">
                  {metric.score}%
                </span>
              </div>
            </div>

            {/* Expanded Details */}
            <AnimatePresence>
              {isExpanded && metric.details && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="pl-12 pr-3 py-3 space-y-2">
                    <div>
                      <div className="text-xs font-medium text-recoder-elements-textTertiary mb-1">Status</div>
                      <div className="text-sm text-recoder-elements-textPrimary">{metric.details}</div>
                    </div>
                    {metric.recommendation && (
                      <div>
                        <div className="text-xs font-medium text-recoder-elements-textTertiary mb-1">Recommendation</div>
                        <div className="text-sm text-recoder-elements-textTertiary">{metric.recommendation}</div>
                      </div>
                    )}
                    {metric.actionItems && metric.actionItems.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-recoder-elements-textTertiary mb-1">Action Items</div>
                        <ul className="space-y-1">
                          {metric.actionItems.map((item: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-sm text-recoder-elements-textTertiary">
                              <span className="text-accent-500 mt-1">-</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      {/* Summary stats */}
      {showSummary && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-5 pt-3 border-t border-recoder-elements-borderColor"
        >
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-accent-500">
                {metrics.filter(m => m.status === 'pass').length}
              </div>
              <div className="text-xs text-recoder-elements-textTertiary">Passing</div>
            </div>
            <div>
              <div className="text-xl font-bold text-accent-600">
                {metrics.filter(m => m.status === 'warning').length}
              </div>
              <div className="text-xs text-recoder-elements-textTertiary">Warning</div>
            </div>
            <div>
              <div className="text-xl font-bold text-accent-800">
                {metrics.filter(m => m.status === 'fail').length}
              </div>
              <div className="text-xs text-recoder-elements-textTertiary">Failing</div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
