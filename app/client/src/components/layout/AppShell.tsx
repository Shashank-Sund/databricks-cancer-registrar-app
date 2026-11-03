import * as React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DemoBanner } from './DemoBanner';
import { Toaster } from '@/components/ui/toaster';
import { IS_STATIC_DEMO } from '@/lib/demo';

export function AppShell() {
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);

  // The phone drawer closes on navigation.
  React.useEffect(() => setNavOpen(false), [pathname]);

  const openNav = React.useCallback(() => setNavOpen(true), []);
  const closeNav = React.useCallback(() => {
    setNavOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  const shell = (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
      <Sidebar mobileOpen={navOpen} onMobileClose={closeNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar navOpen={navOpen} onOpenNav={openNav} menuButtonRef={menuButtonRef} />
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
  // Public demo build only (VITE_DEMO_BANNER=true): stack the notice above the shell.
  if (!IS_STATIC_DEMO) return shell;
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <DemoBanner />
      <div className="min-h-0 flex-1">{shell}</div>
    </div>
  );
}
