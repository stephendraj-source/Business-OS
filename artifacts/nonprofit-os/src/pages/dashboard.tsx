import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout';
import { ProcessTable } from '@/components/process-table';
import { HorizontalTree } from '@/components/horizontal-tree';
import { ProcessMap } from '@/components/process-map';
import { Connectors } from '@/components/connectors';
import { Chatbot, NAVIGATE_KNOWLEDGE_EVENT } from '@/components/chatbot';
import { AuditLogsView } from '@/components/audit-logs-view';
import { DashboardsView } from '@/components/dashboards-view';
import { ReportsView } from '@/components/reports-view';
import { GovernanceView } from '@/components/governance-view';
import { SettingsView } from '@/components/settings-view';
import { AiAgentsView } from '@/components/ai-agents-view';
import { WorkflowsView } from '@/components/workflows-view';
import { FormsView } from '@/components/forms-view';
import { UsersView } from '@/components/users-view';
import { InitiativesView } from '@/components/initiatives-view';
import { StrategyView } from '@/components/strategy-view';
import { ConfigurationView } from '@/components/configuration-view';
import { ActivitiesView } from '@/components/activities-view';
import { TasksView } from '@/components/tasks-view';
import { motion, AnimatePresence } from 'framer-motion';

type ActiveView = 'table' | 'tree' | 'portfolio' | 'process-map' | 'connectors' | 'governance' | 'dashboards' | 'reports' | 'audit-logs' | 'settings' | 'ai-agents' | 'workflows' | 'forms' | 'users' | 'initiatives' | 'configuration' | 'activities' | 'tasks' | 'strategy';

const fadeSlide = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2 },
};

export default function Dashboard() {
  const [activeView, setActiveView] = useState<ActiveView>('table');
  const [treeInitialCategory, setTreeInitialCategory] = useState<string | null>(null);
  const [navHistory, setNavHistory] = useState<ActiveView[]>([]);
  const [openKnowledgeId, setOpenKnowledgeId] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { itemId } = (e as CustomEvent<{ itemId: number }>).detail;
      setNavHistory(prev => [...prev, activeView]);
      setActiveView('forms');
      setOpenKnowledgeId(itemId);
    };
    window.addEventListener(NAVIGATE_KNOWLEDGE_EVENT, handler);
    return () => window.removeEventListener(NAVIGATE_KNOWLEDGE_EVENT, handler);
  }, [activeView]);

  function navigateTo(view: ActiveView) {
    if (view === activeView) return;
    setNavHistory(prev => [...prev, activeView]);
    if (view !== 'tree') setTreeInitialCategory(null);
    setActiveView(view);
  }

  function goBack() {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory(h => h.slice(0, -1));
    if (prev !== 'tree') setTreeInitialCategory(null);
    setActiveView(prev);
  }

  const navigateToProcessMap = (category: string) => {
    setNavHistory(prev => [...prev, activeView]);
    setTreeInitialCategory(category);
    setActiveView('tree');
  };

  return (
    <Layout
      activeView={activeView}
      onViewChange={navigateTo}
      canGoBack={navHistory.length > 0}
      onBack={goBack}
    >
      <AnimatePresence mode="wait">
        {activeView === 'table' && (
          <motion.div key="table" {...fadeSlide} className="w-full h-full">
            <ProcessTable mode="matrix" />
          </motion.div>
        )}
        {activeView === 'tree' && (
          <motion.div key="tree" {...fadeSlide} className="w-full h-full">
            <HorizontalTree initialCategory={treeInitialCategory} />
          </motion.div>
        )}
        {activeView === 'process-map' && (
          <motion.div key="process-map" {...fadeSlide} className="w-full h-full">
            <ProcessMap />
          </motion.div>
        )}
        {activeView === 'portfolio' && (
          <motion.div key="portfolio" {...fadeSlide} className="w-full h-full">
            <ProcessTable mode="portfolio" />
          </motion.div>
        )}
        {activeView === 'connectors' && (
          <motion.div key="connectors" {...fadeSlide} className="w-full h-full">
            <Connectors />
          </motion.div>
        )}
        {activeView === 'dashboards' && (
          <motion.div key="dashboards" {...fadeSlide} className="w-full h-full">
            <DashboardsView onNavigateToProcessMap={navigateToProcessMap} />
          </motion.div>
        )}
        {activeView === 'governance' && (
          <motion.div key="governance" {...fadeSlide} className="w-full h-full">
            <GovernanceView />
          </motion.div>
        )}
        {activeView === 'reports' && (
          <motion.div key="reports" {...fadeSlide} className="w-full h-full">
            <ReportsView />
          </motion.div>
        )}
        {activeView === 'audit-logs' && (
          <motion.div key="audit-logs" {...fadeSlide} className="w-full h-full">
            <AuditLogsView />
          </motion.div>
        )}
        {activeView === 'settings' && (
          <motion.div key="settings" {...fadeSlide} className="w-full h-full">
            <SettingsView />
          </motion.div>
        )}
        {activeView === 'ai-agents' && (
          <motion.div key="ai-agents" {...fadeSlide} className="w-full h-full">
            <AiAgentsView />
          </motion.div>
        )}
        {activeView === 'workflows' && (
          <motion.div key="workflows" {...fadeSlide} className="w-full h-full">
            <WorkflowsView />
          </motion.div>
        )}
        {activeView === 'forms' && (
          <motion.div key="forms" {...fadeSlide} className="w-full h-full">
            <FormsView openKnowledgeId={openKnowledgeId} onKnowledgeOpened={() => setOpenKnowledgeId(null)} />
          </motion.div>
        )}
        {activeView === 'users' && (
          <motion.div key="users" {...fadeSlide} className="w-full h-full">
            <UsersView />
          </motion.div>
        )}
        {activeView === 'initiatives' && (
          <motion.div key="initiatives" {...fadeSlide} className="w-full h-full">
            <InitiativesView />
          </motion.div>
        )}
        {activeView === 'strategy' && (
          <motion.div key="strategy" {...fadeSlide} className="w-full h-full">
            <StrategyView />
          </motion.div>
        )}
        {activeView === 'configuration' && (
          <motion.div key="configuration" {...fadeSlide} className="w-full h-full">
            <ConfigurationView />
          </motion.div>
        )}
        {activeView === 'activities' && (
          <motion.div key="activities" {...fadeSlide} className="w-full h-full">
            <ActivitiesView />
          </motion.div>
        )}
        {activeView === 'tasks' && (
          <motion.div key="tasks" {...fadeSlide} className="w-full h-full">
            <TasksView />
          </motion.div>
        )}
      </AnimatePresence>
      <Chatbot />
    </Layout>
  );
}
