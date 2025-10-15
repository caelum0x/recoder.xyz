export function ProgressBar({ 
  value, 
  max = 100, 
  color = 'orange',
  showLabel = false 
}: { 
  value: number; 
  max?: number; 
  color?: 'orange' | 'green' | 'red' | 'blue';
  showLabel?: boolean;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const colors = {
    orange: 'bg-gradient-to-r from-orange-500 to-purple-600',
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  };

  return (
    <div className="w-full">
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colors[color]} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="text-sm text-gray-400 mt-1">{Math.round(percentage)}%</div>
      )}
    </div>
  );
}
