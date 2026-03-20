import { Box, TableProperties, Network, Settings, Bell, LayoutDashboard, Briefcase, Map, Plug, FileBarChart, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgName } from '@/hooks/use-org-name';

type ActiveView = 'table' | 'tree' | 'portfolio' | 'process-map' | 'connectors' | 'governance' | 'dashboards' | 'reports' | 'audit-logs' | 'settings';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}

export function Layout({ children, activeView, onViewChange }: LayoutProps) {
  const orgName = useOrgName();
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
              <NavItem icon={<TableProperties />} label="Process Catalogue" active={activeView === 'table'} onClick={() => onViewChange('table')} />
              <NavItem icon={<Network />} label="Process Map" active={activeView === 'tree'} onClick={() => onViewChange('tree')} />
              <NavItem icon={<Briefcase />} label="Portfolio Catalogue" active={activeView === 'portfolio'} onClick={() => onViewChange('portfolio')} />
              <NavItem icon={<Map />} label="Portfolio Map" active={activeView === 'process-map'} onClick={() => onViewChange('process-map')} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Governance</div>
            <div className="space-y-1">
              <NavItem icon={<ShieldCheck />} label="Governance" active={activeView === 'governance'} onClick={() => onViewChange('governance')} />
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

        </nav>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-accent transition-colors cursor-pointer">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold border border-border">
              JD
            </div>
            <div>
              <div className="text-sm font-medium">Jane Doe</div>
              <div className="text-xs text-sidebar-foreground/60">System Admin</div>
            </div>
          </div>
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)]">
        {children}
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
