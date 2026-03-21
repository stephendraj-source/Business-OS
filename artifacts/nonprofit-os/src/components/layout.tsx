import React, { useState } from 'react';
import {
  Box, TableProperties, Network, Settings, Bell, LayoutDashboard, Briefcase,
  Map, Plug, FileBarChart, ShieldCheck, ChevronLeft, ChevronRight, Home, Bot, GitBranch, Users, Flag, LogOut, Coins, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgName } from '@/hooks/use-org-name';
import { useUser } from '@/contexts/UserContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/use-credits';

type ActiveView = 'table' | 'tree' | 'portfolio' | 'process-map' | 'connectors' | 'governance' | 'dashboards' | 'reports' | 'audit-logs' | 'settings' | 'ai-agents' | 'workflows' | 'forms' | 'users' | 'initiatives';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  canGoBack?: boolean;
  onBack?: () => void;
}

type ViewMeta = { label: string; section: string };

const VIEW_META: Record<ActiveView, ViewMeta> = {
  table:        { label: 'Master Catalogue',   section: 'Core Views' },
  tree:         { label: 'Master Map',          section: 'Core Views' },
  portfolio:    { label: 'Process Catalogue',   section: 'Core Views' },
  'process-map':{ label: 'Process Map',         section: 'Core Views' },
  governance:   { label: 'Governance',          section: 'Governance' },
  connectors:   { label: 'Connectors',          section: 'Integrations' },
  dashboards:   { label: 'Dashboards',          section: 'System' },
  reports:      { label: 'Reports',             section: 'System' },
  'audit-logs': { label: 'Audit & Logs',        section: 'System' },
  settings:     { label: 'Settings',            section: 'System' },
  'ai-agents':  { label: 'AI Agents',           section: 'AI' },
  'workflows':  { label: 'Workflows',           section: 'Workflows' },
  'forms':      { label: 'Forms',               section: 'Workflows' },
  'users':      { label: 'Users',               section: 'Admin' },
  'initiatives':{ label: 'Initiatives',         section: 'Strategy' },
};

export function Layout({ children, activeView, onViewChange, canGoBack = false, onBack }: LayoutProps) {
  const orgName = useOrgName();
  const meta = VIEW_META[activeView];
  const { currentUser } = useUser();
  const { logout, isSuperUser, isAdmin } = useAuth();
  const { credits } = useCredits();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">

      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">

        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
            <Box className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight truncate" title={orgName}>{orgName}</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8">

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Core Views</div>
            <div className="space-y-1">
              <NavItem icon={<TableProperties />} label="Master Catalogue" active={activeView === 'table'} onClick={() => onViewChange('table')} />
              <NavItem icon={<Network />} label="Master Map" active={activeView === 'tree'} onClick={() => onViewChange('tree')} />
              <NavItem icon={<Briefcase />} label="Process Catalogue" active={activeView === 'portfolio'} onClick={() => onViewChange('portfolio')} />
              <NavItem icon={<Map />} label="Process Map" active={activeView === 'process-map'} onClick={() => onViewChange('process-map')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Strategy</div>
            <div className="space-y-1">
              <NavItem icon={<Flag />} label="Initiatives" active={activeView === 'initiatives'} onClick={() => onViewChange('initiatives')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Governance</div>
            <div className="space-y-1">
              <NavItem icon={<ShieldCheck />} label="Governance" active={activeView === 'governance'} onClick={() => onViewChange('governance')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Workflows</div>
            <div className="space-y-1">
              <NavItem icon={<GitBranch />} label="Workflows" active={activeView === 'workflows'} onClick={() => onViewChange('workflows')} />
              <NavItem icon={<ClipboardList />} label="Forms" active={activeView === 'forms'} onClick={() => onViewChange('forms')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">AI</div>
            <div className="space-y-1">
              <NavItem icon={<Bot />} label="AI Agents" active={activeView === 'ai-agents'} onClick={() => onViewChange('ai-agents')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Integrations</div>
            <div className="space-y-1">
              <NavItem icon={<Plug />} label="Connectors" active={activeView === 'connectors'} onClick={() => onViewChange('connectors')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">System</div>
            <div className="space-y-1">
              <NavItem icon={<LayoutDashboard />} label="Dashboards" active={activeView === 'dashboards'} onClick={() => onViewChange('dashboards')} />
              <NavItem icon={<FileBarChart />} label="Reports" active={activeView === 'reports'} onClick={() => onViewChange('reports')} />
              <NavItem icon={<Bell />} label="Audit &amp; Logs" active={activeView === 'audit-logs'} onClick={() => onViewChange('audit-logs')} />
              <NavItem icon={<Settings />} label="Settings" active={activeView === 'settings'} onClick={() => onViewChange('settings')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Admin</div>
            <div className="space-y-1">
              <NavItem icon={<Users />} label="Users" active={activeView === 'users'} onClick={() => onViewChange('users')} />
            </div>
          </div>

        </nav>

        {/* Credits Widget — visible to tenant admins only */}
        {!isSuperUser && isAdmin && credits !== null && (
          <div className="px-4 pb-3">
            <div className={cn(
              "rounded-xl px-3 py-2.5 border text-xs",
              credits <= 0
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : credits < 500
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-primary/5 border-primary/20 text-sidebar-foreground/70"
            )}>
              <div className="flex items-center gap-2 mb-1">
                <Coins className={cn("w-3.5 h-3.5 flex-shrink-0",
                  credits <= 0 ? "text-red-400" : credits < 500 ? "text-amber-400" : "text-primary"
                )} />
                <span className="font-semibold uppercase tracking-wider text-[10px]">AI Credits</span>
              </div>
              <div className={cn("text-lg font-bold tabular-nums leading-none",
                credits <= 0 ? "text-red-400" : credits < 500 ? "text-amber-400" : "text-foreground"
              )}>
                {credits.toLocaleString()}
              </div>
              {credits <= 0 && (
                <div className="mt-1 text-[10px] text-red-400/80">No credits remaining</div>
              )}
              {credits > 0 && credits < 500 && (
                <div className="mt-1 text-[10px] text-amber-400/80">Credits running low</div>
              )}
            </div>
          </div>
        )}

        {/* User Profile Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 p-2">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold border border-border flex-shrink-0">
              {currentUser ? (currentUser.firstName?.[0] || currentUser.name?.[0] || '?').toUpperCase() : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{currentUser?.name || '—'}</div>
              <div className="text-xs text-sidebar-foreground/60 truncate capitalize">{currentUser?.role || '—'}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)]">

        {/* Breadcrumb bar */}
        <div className="flex-none flex items-center gap-1 h-10 px-4 border-b border-border bg-card/60 backdrop-blur-sm z-30">
          {/* Back button */}
          <button
            onClick={onBack}
            disabled={!canGoBack}
            title={canGoBack ? 'Go back' : 'No history'}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150",
              canGoBack
                ? "text-foreground/70 hover:text-foreground hover:bg-secondary cursor-pointer"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-border mx-1" />

          {/* Breadcrumb segments */}
          <div className="flex items-center gap-0.5 text-xs min-w-0">
            {/* Home / org name */}
            <button
              onClick={() => onViewChange('table')}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap",
                activeView === 'table'
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Home className="w-3 h-3 flex-shrink-0" />
              <span className="hidden sm:inline truncate max-w-[120px]">{orgName}</span>
            </button>

            <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />

            {/* Section */}
            <span className="px-1.5 py-0.5 text-muted-foreground whitespace-nowrap hidden md:inline">
              {meta.section}
            </span>

            <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 hidden md:inline" />

            {/* Current page */}
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium whitespace-nowrap">
              {meta.label}
            </span>
          </div>
        </div>

        {/* View content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>

      </main>

    </div>
  );
}

function NavItem({ icon, label, active, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium",
        disabled && "opacity-50 cursor-not-allowed",
        active
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <span className={cn("w-5 h-5", active ? "text-primary" : "text-sidebar-foreground/60")}>
        {icon}
      </span>
      {label}
    </button>
  );
}
