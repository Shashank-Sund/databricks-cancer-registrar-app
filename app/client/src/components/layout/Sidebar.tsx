import * as React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ClipboardList,
  FolderOpen,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
} from 'lucide-react';
import { branding } from '@/lib/branding';
import { useUiStore } from '@/store/uiStore';
import { useDrafts } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { DraftsNavList } from './DraftsNavList';
import { Button } from '@/components/ui/button';

const NAV = [
  { to: '/', label: 'Queue', Icon: ClipboardList, end: true },
  { to: '/drafts', label: 'My Drafts', Icon: FolderOpen, end: false },
  { to: '/getting-started', label: 'Getting Started', Icon: BookOpen, end: false },
];

/** Brand, nav, live drafts and (desktop only) the collapse toggle. */
function SidebarBody({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle?: () => void;
}) {
  const { data } = useDrafts();
  const draftCount = data?.items.length ?? 0;

  return (
    <>
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Activity className="h-5 w-5" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-card-foreground">
              {branding.name}
            </p>
            <p className="truncate text-2xs text-muted-foreground">{branding.subtitle}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="mt-3 px-2" aria-label="Sections">
        <ul className="space-y-0.5" role="list">
          {NAV.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground/80 hover:bg-muted',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && label === 'My Drafts' && draftCount > 0 && (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-2xs font-semibold text-secondary-foreground">
                    {draftCount}
                  </span>
                )}
                {collapsed && label === 'My Drafts' && draftCount > 0 && (
                  <span className="sr-only">{draftCount} drafts</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Live drafts list */}
      {!collapsed && (
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <p className="px-4 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            In progress
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <DraftsNavList />
          </div>
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      {/* Collapse toggle (desktop rail only) */}
      {onToggle && (
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            onClick={onToggle}
            className={cn('w-full', !collapsed && 'justify-start')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}

export const MOBILE_NAV_ID = 'mobile-nav';

interface SidebarProps {
  /** Phone/tablet drawer state (below the md breakpoint). */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const drawerRef = React.useRef<HTMLElement>(null);

  // Drawer: Escape closes; focus moves into it on open.
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose();
    };
    document.addEventListener('keydown', onKey);
    drawerRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop rail (md and up). */}
      <aside
        className={cn(
          'hidden h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
        aria-label="Primary"
      >
        <SidebarBody collapsed={collapsed} onToggle={toggle} />
      </aside>

      {/* Phone/tablet overlay drawer (below md). */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close navigation"
            className="absolute inset-0 h-full w-full bg-foreground/40"
            onClick={onMobileClose}
          />
          <aside
            ref={drawerRef}
            id={MOBILE_NAV_ID}
            aria-label="Primary"
            className="relative flex h-full w-64 max-w-[85vw] flex-col border-r border-border bg-card shadow-lg"
          >
            <SidebarBody collapsed={false} />
          </aside>
        </div>
      )}
    </>
  );
}
