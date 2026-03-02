'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ScoreChartProps {
  score: number;
  enhanced?: boolean;
  size?: number;
  label?: string;
}

export default function ScoreChart({
  score,
  enhanced = false,
  size = 200,
  label = 'Score'
}: ScoreChartProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = size / 2 - 20;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(score);
    }, 300);
    return () => clearTimeout(timer);
  }, [score]);

  // Calculate stroke dash offset for the progress
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  // Determine color based on score using recoder-web theme
  const getColor = () => {
    if (score >= 80) return '#F79009'; // accent-500 - Excellent
    if (score >= 60) return '#DC6803'; // accent-600 - Good
    if (score >= 40) return '#B54708'; // accent-700 - Warning
    return '#93370D'; // accent-800 - Poor
  };

  const getGradientId = enhanced ? 'enhanced-gradient' : 'normal-gradient';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={getGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={getColor()} stopOpacity="1" />
            <stop offset="100%" stopColor={enhanced ? '#FDB022' : getColor()} stopOpacity="0.6" />
          </linearGradient>
          <filter id="score-glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="12"
        />

        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${getGradientId})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          filter="url(#score-glow)"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          className="text-4xl font-bold text-accent-600"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          {animatedScore}%
        </motion.div>
        <motion.div
          className="text-sm text-recoder-elements-textTertiary mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {label}
        </motion.div>
        {enhanced && (
          <motion.div
            className="text-xs text-accent-500 mt-1 font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            AI Enhanced
          </motion.div>
        )}
      </div>
    </div>
  );
}
