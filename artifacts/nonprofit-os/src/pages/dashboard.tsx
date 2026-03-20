import { useState } from 'react';
import { Layout } from '@/components/layout';
import { ProcessTable } from '@/components/process-table';
import { HorizontalTree } from '@/components/horizontal-tree';
import { motion, AnimatePresence } from 'framer-motion';

export default function Dashboard() {
  const [activeView, setActiveView] = useState<'table' | 'tree'>('table');

  return (
    <Layout activeView={activeView} onViewChange={setActiveView}>
      <AnimatePresence mode="wait">
        {activeView === 'table' ? (
          <motion.div
            key="table"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full"
          >
            <ProcessTable />
          </motion.div>
        ) : (
          <motion.div
            key="tree"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full"
          >
            <HorizontalTree />
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
