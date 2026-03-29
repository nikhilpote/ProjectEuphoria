interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({ label, value, subtext, trend }: StatCardProps) {
  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-gray-500',
  };

  return (
    <div className="bg-euphoria-card border border-euphoria-border rounded-xl p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-100">{value}</p>
      {subtext && (
        <p className={`mt-1 text-xs ${trend ? trendColors[trend] : 'text-gray-500'}`}>
          {subtext}
        </p>
      )}
    </div>
  );
}
