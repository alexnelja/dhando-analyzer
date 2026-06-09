import React from 'react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '▦' },
  { path: '/watchlist', label: 'Watchlist', icon: '◉' },
  { path: '/screener', label: 'Screener', icon: '⊞' },
  { path: '/financials', label: 'Financials', icon: '▤' },
  { path: '/deal-analyzer', label: 'Deal Analyzer', icon: '◈' },
  { path: '/portfolio', label: 'Portfolio', icon: '◎' },
  { path: '/compare', label: 'Compare', icon: '⚖' },
  { path: '/distress', label: 'Distress Radar', icon: '⚠' },
  { path: '/magic-formula', label: 'Magic Formula', icon: '✦' },
  { path: '/calculator', label: 'Calculator', icon: '⊞' },
  { path: '/predictions', label: 'Predictions', icon: '⊙' },
  { path: '/stakeholders', label: 'Stakeholders', icon: '♟' },
  { path: '/private-markets', label: 'Private Markets', icon: '◇' },
  { path: '/rules', label: 'Rules', icon: '≡' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex flex-col w-60 min-w-[240px] h-full overflow-y-auto"
        style={{ backgroundColor: '#141413' }}
      >
        {/* App title */}
        <div className="px-5 pt-8 pb-6 border-b border-white/10">
          <h1 className="text-white font-semibold text-base leading-tight tracking-tight">
            Dhando Analyzer
          </h1>
          <p className="text-xs mt-1" style={{ color: '#b0aea5' }}>
            Systematic Value Investing
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive
                        ? 'text-white font-medium'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/5',
                    ].join(' ')
                  }
                  style={({ isActive }) =>
                    isActive ? { backgroundColor: 'rgba(217, 119, 87, 0.15)', color: '#d97757' } : {}
                  }
                >
                  <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-xs" style={{ color: '#b0aea5' }}>
            v0.1.0 — Phase 9
          </p>
        </div>

        {/* Browser mode warning */}
        {typeof window !== 'undefined' && !(window as any).dhando && (
          <div
            className="px-4 py-3 text-xs text-center leading-snug"
            style={{ backgroundColor: '#92400e', color: '#fef3c7' }}
          >
            Browser Mode — data is not persisted. Run in Electron for full functionality.
          </div>
        )}
      </aside>

      {/* Main content */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ backgroundColor: '#faf9f5' }}
      >
        {children}
      </main>
    </div>
  );
}
