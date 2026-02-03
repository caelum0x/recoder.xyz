'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface RadarChartDataPoint {
  label: string;
  score: number;
  maxScore?: number;
}

interface RadarChartProps {
  data: RadarChartDataPoint[];
  size?: number;
  color?: string;
  showLegend?: boolean;
}

export default function RadarChart({
  data,
  size = 300,
  color = '#F79009',
  showLegend = true
}: RadarChartProps) {
  const [isAnimated, setIsAnimated] = useState(false);
  const center = size / 2;
  const radius = (size / 2) - 60;
  const angleStep = (Math.PI * 2) / data.length;

  useEffect(() => {
    setIsAnimated(true);
  }, []);

  // Calculate points for the polygon
  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle)
    };
  };

  // Create polygon points string
  const polygonPoints = data
    .map((item, i) => {
      const point = getPoint(isAnimated ? item.score : 0, i);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  // Grid levels
  const gridLevels = [20, 40, 60, 80, 100];

  // Score color thresholds
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#F79009'; // accent-500
    if (score >= 60) return '#DC6803'; // accent-600
    return '#B54708'; // accent-700
  };

  return (
    <div className="relative">
      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <linearGradient id="radar-fill-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.8" />
            <stop offset="100%" stopColor={color} stopOpacity="0.2" />
          </linearGradient>
          <filter id="radar-glow-filter">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Grid circles */}
        {gridLevels.map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={(level / 100) * radius}
            fill="none"
            stroke="rgba(0,0,0,0.08)"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {data.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x2}
              y2={y2}
              stroke="rgba(0,0,0,0.08)"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon */}
        <motion.polygon
          points={polygonPoints}
          fill="url(#radar-fill-gradient)"
          stroke={color}
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          filter="url(#radar-glow-filter)"
        />

        {/* Data points */}
        {data.map((item, i) => {
          const point = getPoint(item.score, i);
          return (
            <motion.circle
              key={i}
              cx={point.x}
              cy={point.y}
              r="4"
              fill={color}
              stroke="white"
              strokeWidth="2"
              initial={{ scale: 0 }}
              animate={{ scale: isAnimated ? 1 : 0 }}
              transition={{ delay: 0.8 + i * 0.1, duration: 0.3 }}
            />
          );
        })}

        {/* Labels */}
        {data.map((item, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const labelRadius = radius + 40;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);

          // Better text anchor logic based on quadrant
          let textAnchor = 'middle';
          let dy = 0;

          // Left side
          if (x < center - 20) {
            textAnchor = 'end';
          }
          // Right side
          else if (x > center + 20) {
            textAnchor = 'start';
          }

          // Top
          if (y < center - 20) {
            dy = -5;
          }
          // Bottom
          else if (y > center + 20) {
            dy = 5;
          }

          return (
            <motion.g key={i}>
              {/* Background for better readability */}
              <motion.rect
                x={x - (textAnchor === 'middle' ? 30 : textAnchor === 'end' ? 60 : 0)}
                y={y - 10}
                width={60}
                height={20}
                fill="white"
                fillOpacity={0.9}
                rx={4}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 + i * 0.05 }}
              />
              <motion.text
                x={x}
                y={y + dy}
                textAnchor={textAnchor as 'start' | 'middle' | 'end'}
                dominantBaseline="middle"
                className="text-xs fill-gray-700 font-medium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 + i * 0.05 }}
                style={{ pointerEvents: 'none' }}
              >
                {item.label}
              </motion.text>
              {/* Score value */}
              <motion.text
                x={x}
                y={y + dy + 12}
                textAnchor={textAnchor as 'start' | 'middle' | 'end'}
                dominantBaseline="middle"
                className="text-[10px] font-bold"
                fill={getScoreColor(item.score)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 + i * 0.05 }}
                style={{ pointerEvents: 'none' }}
              >
                {item.score}%
              </motion.text>
            </motion.g>
          );
        })}
      </svg>

      {/* Legend */}
      {showLegend && (
        <div className="mt-4 flex justify-center">
          <div className="inline-flex flex-row gap-4 text-xs text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 px-4 py-2 rounded-md shadow-sm border border-bolt-elements-borderColor">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent-500" />
              <span className="whitespace-nowrap">80-100%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent-600" />
              <span className="whitespace-nowrap">60-79%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent-700" />
              <span className="whitespace-nowrap">&lt;60%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
