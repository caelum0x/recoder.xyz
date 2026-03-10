'use client';

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';

interface ChartWidgetProps {
  config: Record<string, any>;
}

const PLACEHOLDER_DATA = Array.from({ length: 14 }, (_, i) => ({
  name: `Day ${i + 1}`,
  value: Math.floor(Math.random() * 40 + 10),
}));

export function ChartWidget({ config }: ChartWidgetProps) {
  const data = config?.data ?? PLACEHOLDER_DATA;
  const color = config?.color ?? '#6366f1';

  return (
    <div className="h-full min-h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" hide />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#chartGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
