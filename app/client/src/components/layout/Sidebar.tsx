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

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const { data } = useDrafts();
  const draftCount = data?.items.length ?? 0;

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
      aria-label="Primary"
    >
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

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={toggle}
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
    </aside>
  );
}
