import { Link, useLocation } from 'react-router-dom';
import { clearToken } from '../api';

const NAV_ITEMS = [
  {
    to: '/',
    tooltip: 'Projektcsoportok',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    ),
    exact: true,
  },
  {
    to: '/knowledge',
    tooltip: 'Tudásbázis',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    ),
  },
  {
    to: '/resources',
    tooltip: 'Erőforrások',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    ),
  },
  {
    to: '/email-triage',
    tooltip: 'Email triage',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    ),
  },
  {
    to: '/agents',
    tooltip: 'Ügynökök',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    ),
  },
  {
    to: '/schedule',
    tooltip: 'Ütemezés',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    ),
  },
  {
    to: '/reports',
    tooltip: 'Jelentések',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
  },
];

function isActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to;
  return pathname.startsWith(to);
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const handleLogout = () => {
    clearToken();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Desktop left sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 flex-col items-center py-4 bg-slate-900 border-r border-slate-800 z-50">
        <span className="text-amber-500 font-bold text-xs tracking-wide mb-6 select-none">
          MC
        </span>

        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(location.pathname, item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative group w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-amber-500/15 text-amber-500'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {item.icon}
                </svg>
                <span className="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-slate-100 bg-slate-800 border border-slate-700 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                  {item.tooltip}
                </span>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="group relative w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span className="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-slate-100 bg-slate-800 border border-slate-700 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
            Kilépés
          </span>
        </button>
      </aside>

      {/* Main content */}
      <div className="md:ml-16 pb-16 md:pb-0">{children}</div>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-slate-900 border-t border-slate-800 flex items-center justify-around z-50">
        {NAV_ITEMS.map((item) => {
          const active = isActive(location.pathname, item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-colors ${
                active
                  ? 'text-amber-500'
                  : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {item.icon}
              </svg>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center w-12 h-12 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </nav>
    </div>
  );
}
