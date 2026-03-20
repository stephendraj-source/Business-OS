import { useState } from 'react';
import { Layout } from '@/components/layout';
import { ProcessTable } from '@/components/process-table';
import { HorizontalTree } from '@/components/horizontal-tree';
import { ProcessMap } from '@/components/process-map';
import { motion, AnimatePresence } from 'framer-motion';

type ActiveView = 'table' | 'tree' | 'portfolio' | 'process-map';

const fadeSlide = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2 },
};

export default function Dashboard() {
  const [activeView, setActiveView] = useState<ActiveView>('table');

  return (
    <Layout activeView={activeView} onViewChange={setActiveView}>
      <AnimatePresence mode="wait">
        {activeView === 'table' && (
          <motion.div key="table" {...fadeSlide} className="w-full h-full">
            <ProcessTable mode="matrix" />
          </motion.div>
        )}
        {activeView === 'tree' && (
          <motion.div key="tree" {...fadeSlide} className="w-full h-full">
            <HorizontalTree />
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
      </AnimatePresence>
    </Layout>
  );
}
