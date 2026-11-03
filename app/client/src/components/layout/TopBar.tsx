import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Moon, Sun, ShieldCheck } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useMe } from '@/hooks/queries';
import { branding } from '@/lib/branding';
import { initials } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { USE_MOCK } from '@/api/client';
import { MOBILE_NAV_ID } from './Sidebar';

function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const toggle = useUiStore((s) => s.toggleTheme);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}

function areaLabel(pathname: string): string {
  if (pathname.startsWith('/cases/')) return 'Case review';
  if (pathname.startsWith('/drafts')) return 'My drafts';
  return 'Triage queue';
}

interface TopBarProps {
  navOpen: boolean;
  onOpenNav: () => void;
  menuButtonRef: React.Ref<HTMLButtonElement>;
}

export function TopBar({ navOpen, onOpenNav, menuButtonRef }: TopBarProps) {
  const { pathname } = useLocation();
  const { data: me } = useMe();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/60 px-3 backdrop-blur md:gap-4 md:px-5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {/* Phone/tablet: the sidebar lives in a drawer behind this button. */}
        <Button
          ref={menuButtonRef}
          variant="ghost"
          size="icon-sm"
          className="shrink-0 md:hidden"
          onClick={onOpenNav}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          aria-controls={MOBILE_NAV_ID}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
        <span className="truncate font-medium text-foreground">{branding.product}</span>
        <span className="text-muted-foreground" aria-hidden="true">
          /
        </span>
        <span className="truncate text-muted-foreground">{areaLabel(pathname)}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {USE_MOCK && (
          <span
            className="hidden items-center gap-1 rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning sm:inline-flex"
            title="Running against the in-memory mock API (no backend required)"
          >
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Demo data
          </span>
        )}
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary"
            aria-hidden="true"
          >
            {initials(me?.display_name)}
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-xs font-medium text-foreground">
              {me?.display_name ?? '—'}
            </p>
            <p className="text-2xs text-muted-foreground">{me?.email ?? ''}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
