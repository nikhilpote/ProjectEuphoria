import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/shows': 'Shows',
  '/liveops': 'Live Operations',
  '/config': 'Config & Feature Flags',
};

export function TopBar() {
  const { pathname } = useLocation();
  const title = pageTitles[pathname] ?? 'Euphoria Admin';

  return (
    <header className="h-16 shrink-0 bg-euphoria-card border-b border-euphoria-border flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-gray-100">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          API Connected
        </span>
      </div>
    </header>
  );
}
