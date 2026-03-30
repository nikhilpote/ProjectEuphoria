import { NavLink } from 'react-router-dom';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '▣' },
  { label: 'Shows', href: '/shows', icon: '◈' },
  { label: 'Games', href: '/games', icon: '⊞' },
  { label: 'LiveOps', href: '/liveops', icon: '◉' },
  { label: 'Reward Rules', href: '/reward-rules', icon: '◎' },
  { label: 'Config', href: '/config', icon: '⊙' },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-euphoria-card border-r border-euphoria-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-euphoria-border">
        <span className="text-xl font-bold bg-gradient-to-r from-euphoria-purple to-euphoria-pink bg-clip-text text-transparent">
          Euphoria
        </span>
        <span className="ml-2 text-xs text-gray-500 font-medium uppercase tracking-widest">
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }: { isActive: boolean }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-euphoria-purple/20 text-euphoria-purple'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-100',
              ].join(' ')
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-euphoria-border">
        <p className="text-xs text-gray-600">Euphoria v0.1.0</p>
      </div>
    </aside>
  );
}
