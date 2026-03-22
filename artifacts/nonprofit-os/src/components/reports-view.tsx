import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  FileBarChart, Download, Filter, ChevronDown, CheckCircle2,
  TrendingUp, Bot, Tag, Layers, BarChart3, Search,
  SlidersHorizontal, GripVertical, X, Plus, RotateCcw, Share2, Copy, Sparkles, Pencil, Code2, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useListProcesses } from '@workspace/api-client-react';
import { useOptimisticUpdateProcess, useCategoriesData } from '@/hooks/use-app-data';
import * as XLSX from 'xlsx';
import { useUser } from '@/contexts/UserContext';
import { ShareModal } from './share-modal';

const API = '/api';

type Process = {
  id: number;
  number: number;
  category: string;
  processName: string;
  processDescription: string;
  aiAgent: string;
  purpose: string;
  inputs: string;
  outputs: string;
  humanInTheLoop: string;
  kpi: string;
  estimatedValueImpact: string;
  industryBenchmark: string;
  included: boolean;
  target: string;
  achievement: string;
  trafficLight?: string;
};

const REPORT_TYPES = [
  { id: 'coverage',   label: 'Process Coverage',   icon: CheckCircle2, description: 'Completeness of process data fields' },
  { id: 'category',   label: 'Category Summary',    icon: Tag,          description: 'Process count and completeness by category' },
  { id: 'ai-agents',  label: 'AI Agent Map',        icon: Bot,          description: 'AI agents and their assigned processes' },
  { id: 'kpi',        label: 'KPI Tracker',         icon: TrendingUp,   description: 'Targets and achievements per process' },
  { id: 'value',      label: 'Value Impact',        icon: BarChart3,    description: 'Estimated value impact per process' },
  { id: 'portfolio',  label: 'Portfolio Inclusion', icon: Layers,       description: 'Included vs excluded processes' },
] as const;

type ReportId = (typeof REPORT_TYPES)[number]['id'];

type FieldDef = { key: string; label: string };

const FIELD_DEFS: Record<ReportId, FieldDef[]> = {
  coverage: [
    { key: 'processId',   label: 'Process ID' },
    { key: 'category',    label: 'Category' },
    { key: 'processName', label: 'Process Name' },
    { key: 'description', label: 'Description' },
    { key: 'fieldsFilled',label: 'Fields Filled' },
    { key: 'completeness',label: 'Completeness' },
    { key: 'status',      label: 'Status' },
    { key: 'trafficLight',label: 'Traffic Light' },
  ],
  category: [
    { key: 'category',        label: 'Category' },
    { key: 'total',           label: 'Total Processes' },
    { key: 'inPortfolio',     label: 'In Portfolio' },
    { key: 'excluded',        label: 'Excluded' },
    { key: 'avgCompleteness', label: 'Avg Completeness' },
    { key: 'status',          label: 'Status' },
  ],
  'ai-agents': [
    { key: 'agent',      label: 'AI Agent' },
    { key: 'count',      label: 'Process Count' },
    { key: 'categories', label: 'Categories Covered' },
    { key: 'processes',  label: 'Processes' },
  ],
  kpi: [
    { key: 'processId',   label: 'Process ID' },
    { key: 'processName', label: 'Process Name' },
    { key: 'category',    label: 'Category' },
    { key: 'kpi',         label: 'KPI' },
    { key: 'target',      label: 'Target' },
    { key: 'achievement', label: 'Achievement' },
    { key: 'trafficLight',label: 'Traffic Light' },
  ],
  value: [
    { key: 'processId',   label: 'Process ID' },
    { key: 'processName', label: 'Process Name' },
    { key: 'category',    label: 'Category' },
    { key: 'valueImpact', label: 'Estimated Value Impact' },
    { key: 'benchmark',   label: 'Industry Benchmark' },
  ],
  portfolio: [
    { key: 'processId',      label: 'Process ID' },
    { key: 'category',       label: 'Category' },
    { key: 'processName',    label: 'Process Name' },
    { key: 'inPortfolio',    label: 'In Portfolio' },
    { key: 'purpose',        label: 'Purpose' },
    { key: 'inputs',         label: 'Inputs' },
    { key: 'outputs',        label: 'Outputs' },
    { key: 'humanInTheLoop', label: 'Human-in-the-Loop' },
  ],
};

const DEFAULT_ACTIVE: Record<ReportId, string[]> = {
  coverage:   ['processId', 'category', 'processName', 'fieldsFilled', 'completeness', 'status'],
  category:   ['category', 'total', 'inPortfolio', 'excluded', 'avgCompleteness', 'status'],
  'ai-agents':['agent', 'count', 'categories', 'processes'],
  kpi:        ['processId', 'processName', 'category', 'kpi', 'target', 'achievement'],
  value:      ['processId', 'processName', 'category', 'valueImpact', 'benchmark'],
  portfolio:  ['processId', 'category', 'processName', 'inPortfolio', 'purpose'],
};

const LS_KEY = 'nonprofit-os-report-fields-v1';

const TRACKABLE_FIELDS: (keyof Process)[] = [
  'processName', 'processDescription', 'aiAgent', 'purpose',
  'inputs', 'outputs', 'humanInTheLoop', 'kpi', 'estimatedValueImpact',
  'industryBenchmark', 'target', 'achievement',
];

// ── Filter builder ──────────────────────────────────────────────────────────

type FilterFieldType = 'text' | 'categorical' | 'numeric' | 'boolean';

interface FilterFieldDef {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: { value: string; label: string }[];
}

const FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'category',             label: 'Category',           type: 'text' },
  { key: 'processName',          label: 'Process Name',       type: 'text' },
  { key: 'processDescription',   label: 'Description',        type: 'text' },
  { key: 'aiAgent',              label: 'AI Agent',           type: 'text' },
  { key: 'purpose',              label: 'Purpose',            type: 'text' },
  { key: 'inputs',               label: 'Inputs',             type: 'text' },
  { key: 'outputs',              label: 'Outputs',            type: 'text' },
  { key: 'humanInTheLoop',       label: 'Human-in-the-Loop', type: 'text' },
  { key: 'kpi',                  label: 'KPI',                type: 'text' },
  { key: 'target',               label: 'Target',             type: 'text' },
  { key: 'achievement',          label: 'Achievement',        type: 'text' },
  { key: 'estimatedValueImpact', label: 'Value Impact',       type: 'text' },
  { key: 'industryBenchmark',    label: 'Benchmark',          type: 'text' },
  { key: 'trafficLight', label: 'Traffic Light', type: 'categorical', options: [
    { value: 'green',  label: 'On Track'  },
    { value: 'orange', label: 'At Risk'   },
    { value: 'red',    label: 'Off Track' },
  ]},
  { key: 'included',      label: 'In Portfolio', type: 'boolean' },
  { key: 'completeness',  label: 'Completeness %', type: 'numeric' },
];

const OPERATORS_BY_TYPE: Record<FilterFieldType, { value: string; label: string }[]> = {
  text: [
    { value: 'contains',     label: 'contains'      },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'is',           label: 'is exactly'    },
    { value: 'is_empty',     label: 'is empty'      },
    { value: 'is_not_empty', label: 'is not empty'  },
  ],
  categorical: [
    { value: 'is',     label: 'is'     },
    { value: 'is_not', label: 'is not' },
  ],
  numeric: [
    { value: 'eq',  label: '= equals'     },
    { value: 'neq', label: '≠ not equals' },
    { value: 'gt',  label: '> greater'    },
    { value: 'lt',  label: '< less'       },
    { value: 'gte', label: '≥ at least'   },
    { value: 'lte', label: '≤ at most'    },
  ],
  boolean: [
    { value: 'is_true',  label: 'is Yes' },
    { value: 'is_false', label: 'is No'  },
  ],
};

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

function applyFilterRules(processes: Process[], rules: FilterRule[]): Process[] {
  if (!rules.length) return processes;
  return processes.filter(p => rules.every(rule => {
    const fieldDef = FILTER_FIELDS.find(f => f.key === rule.field);
    if (!fieldDef) return true;
    const rawVal: unknown = fieldDef.key === 'completeness'
      ? Math.round((TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length / TRACKABLE_FIELDS.length) * 100)
      : (p as any)[rule.field];
    const strVal = String(rawVal ?? '').toLowerCase();
    const filterVal = rule.value.toLowerCase();
    switch (rule.operator) {
      case 'contains':     return strVal.includes(filterVal);
      case 'not_contains': return !strVal.includes(filterVal);
      case 'is':           return strVal === filterVal;
      case 'is_not':       return strVal !== filterVal;
      case 'is_empty':     return !strVal.trim();
      case 'is_not_empty': return !!strVal.trim();
      case 'is_true':      return rawVal === true || rawVal === 'true' || rawVal === 1;
      case 'is_false':     return rawVal === false || rawVal === 'false' || rawVal === 0 || rawVal === null || rawVal === undefined;
      case 'eq':  return Number(rawVal) === Number(rule.value);
      case 'neq': return Number(rawVal) !== Number(rule.value);
      case 'gt':  return Number(rawVal) >   Number(rule.value);
      case 'lt':  return Number(rawVal) <   Number(rule.value);
      case 'gte': return Number(rawVal) >=  Number(rule.value);
      case 'lte': return Number(rawVal) <=  Number(rule.value);
      default:    return true;
    }
  }));
}

function filterRuleLabel(rule: FilterRule): string {
  const field = FILTER_FIELDS.find(f => f.key === rule.field)?.label ?? rule.field;
  const op    = OPERATORS_BY_TYPE[FILTER_FIELDS.find(f => f.key === rule.field)?.type ?? 'text']
    ?.find(o => o.value === rule.operator)?.label ?? rule.operator;
  if (rule.operator === 'is_empty' || rule.operator === 'is_not_empty' || rule.operator === 'is_true' || rule.operator === 'is_false') {
    return `${field} ${op}`;
  }
  const valLabel = FILTER_FIELDS.find(f => f.key === rule.field)?.options?.find(o => o.value === rule.value)?.label ?? rule.value;
  return `${field} ${op} "${valLabel}"`;
}

// ── SQL Generation ──────────────────────────────────────────────────────────

const FIELD_TO_SQL_COL: Record<string, string> = {
  processId:           'number',
  processName:         'process_short_name',
  description:         'process_name',
  processDescription:  'process_name',
  category:            'category',
  aiAgent:             'ai_agent',
  aiAgentActive:       'ai_agent_active',
  purpose:             'purpose',
  inputs:              'inputs',
  outputs:             'outputs',
  humanInTheLoop:      'human_in_the_loop',
  kpi:                 'kpi',
  target:              'target',
  achievement:         'achievement',
  trafficLight:        'traffic_light',
  estimatedValueImpact:'estimated_value_impact',
  valueImpact:         'estimated_value_impact',
  industryBenchmark:   'industry_benchmark',
  benchmark:           'industry_benchmark',
  included:            'included',
  inPortfolio:         'included',
  aiScore:             'ai_score',
};

const COMPLETENESS_EXPR = [
  'process_short_name','process_name','ai_agent','purpose','inputs','outputs',
  'human_in_the_loop','kpi','estimated_value_impact','industry_benchmark','target','achievement',
].map(c => `CASE WHEN ${c} IS NOT NULL AND ${c} <> '' THEN 1 ELSE 0 END`).join('\n           + ');

const COMPLETENESS_SQL = `ROUND((\n           ${COMPLETENESS_EXPR}\n         )::numeric / 12 * 100)`;

function q(v: string) { return `'${v.replace(/'/g, "''")}'`; }

function filterRuleToSql(rule: FilterRule): string {
  if (rule.field === 'completeness') {
    const expr = COMPLETENESS_SQL;
    switch (rule.operator) {
      case 'eq':  return `${expr} = ${rule.value}`;
      case 'neq': return `${expr} <> ${rule.value}`;
      case 'gt':  return `${expr} > ${rule.value}`;
      case 'lt':  return `${expr} < ${rule.value}`;
      case 'gte': return `${expr} >= ${rule.value}`;
      case 'lte': return `${expr} <= ${rule.value}`;
      default:    return `-- completeness ${rule.operator} ${rule.value}`;
    }
  }
  const col = FIELD_TO_SQL_COL[rule.field] ?? rule.field;
  switch (rule.operator) {
    case 'contains':     return `${col} ILIKE ${q('%' + rule.value + '%')}`;
    case 'not_contains': return `${col} NOT ILIKE ${q('%' + rule.value + '%')}`;
    case 'is':           return `${col} = ${q(rule.value)}`;
    case 'is_not':       return `${col} <> ${q(rule.value)}`;
    case 'is_empty':     return `(${col} IS NULL OR ${col} = '')`;
    case 'is_not_empty': return `(${col} IS NOT NULL AND ${col} <> '')`;
    case 'is_true':      return `${col} = TRUE`;
    case 'is_false':     return `(${col} = FALSE OR ${col} IS NULL)`;
    case 'eq':           return `${col} = ${rule.value}`;
    case 'neq':          return `${col} <> ${rule.value}`;
    case 'gt':           return `${col} > ${rule.value}`;
    case 'lt':           return `${col} < ${rule.value}`;
    case 'gte':          return `${col} >= ${rule.value}`;
    case 'lte':          return `${col} <= ${rule.value}`;
    default:             return `-- unknown: ${rule.operator}`;
  }
}

function buildWhere(categoryFilter: string, searchQuery: string, filterRules: FilterRule[], forCategory = false): string {
  const conds: string[] = ['tenant_id = :tenant_id'];
  if (!forCategory && categoryFilter !== 'all') conds.push(`category = ${q(categoryFilter)}`);
  if (!forCategory && searchQuery.trim()) {
    const sq = searchQuery.trim().replace(/'/g, "''");
    conds.push(`(process_short_name ILIKE ${q('%' + sq + '%')}\n     OR process_name ILIKE ${q('%' + sq + '%')}\n     OR category ILIKE ${q('%' + sq + '%')})`);
  }
  for (const rule of filterRules) conds.push(filterRuleToSql(rule));
  return `WHERE ${conds.join('\n   AND ')}`;
}

function buildOrderBy(sortKey: string | null, sortDir: 'asc' | 'desc', fallback: string): string {
  if (!sortKey) return `ORDER BY ${fallback}`;
  const col = FIELD_TO_SQL_COL[sortKey] ?? sortKey;
  return `ORDER BY ${col} ${sortDir.toUpperCase()}`;
}

interface SqlParams {
  activeReport: string;
  categoryFilter: string;
  searchQuery: string;
  filterRules: FilterRule[];
  activeFields: string[];
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  activeCustomReport: { name: string; fields: string[] } | null;
}

function generateReportSQL(p: SqlParams): string {
  const where = buildWhere(p.categoryFilter, p.searchQuery, p.filterRules);
  const whereAgg = buildWhere(p.categoryFilter, p.searchQuery, p.filterRules, true);

  if (p.activeReport === 'coverage') {
    const cols = p.activeFields.map(k => {
      if (k === 'processId')   return `  'PRO-' || LPAD(number::text, 3, '0') AS "Process ID"`;
      if (k === 'category')    return `  category AS "Category"`;
      if (k === 'processName') return `  process_short_name AS "Process Name"`;
      if (k === 'description') return `  process_name AS "Description"`;
      if (k === 'fieldsFilled') return `  -- "Fields Filled" computed in application`;
      if (k === 'completeness') return `  ${COMPLETENESS_SQL} AS "Completeness %"`;
      if (k === 'status')      return `  CASE WHEN ${COMPLETENESS_SQL} >= 80 THEN 'Complete'\n       WHEN ${COMPLETENESS_SQL} >= 50 THEN 'Partial' ELSE 'Sparse' END AS "Status"`;
      if (k === 'trafficLight') return `  traffic_light AS "Traffic Light"`;
      return `  ${FIELD_TO_SQL_COL[k] ?? k}`;
    }).join(',\n');
    return `SELECT\n${cols}\nFROM processes\n${where}\n${buildOrderBy(p.sortKey, p.sortDir, 'number ASC')}`;
  }

  if (p.activeReport === 'category') {
    const cols = p.activeFields.map(k => {
      if (k === 'category')        return `  category AS "Category"`;
      if (k === 'total')           return `  COUNT(*) AS "Total Processes"`;
      if (k === 'inPortfolio')     return `  COUNT(*) FILTER (WHERE included = TRUE) AS "In Portfolio"`;
      if (k === 'excluded')        return `  COUNT(*) FILTER (WHERE included = FALSE) AS "Excluded"`;
      if (k === 'avgCompleteness') return `  ROUND(AVG(${COMPLETENESS_SQL})) AS "Avg Completeness %"`;
      if (k === 'status')          return `  CASE WHEN ROUND(AVG(${COMPLETENESS_SQL})) >= 80 THEN 'Complete'\n       WHEN ROUND(AVG(${COMPLETENESS_SQL})) >= 50 THEN 'Partial' ELSE 'Sparse' END AS "Status"`;
      return `  ${FIELD_TO_SQL_COL[k] ?? k}`;
    }).join(',\n');
    const sortMap: Record<string, string> = { category: 'category', total: 'COUNT(*)', inPortfolio: 'COUNT(*) FILTER (WHERE included = TRUE)', excluded: 'COUNT(*) FILTER (WHERE included = FALSE)' };
    const ob = p.sortKey ? `ORDER BY ${sortMap[p.sortKey] ?? p.sortKey} ${p.sortDir.toUpperCase()}` : 'ORDER BY COUNT(*) DESC';
    return `SELECT\n${cols}\nFROM processes\n${whereAgg}\nGROUP BY category\n${ob}`;
  }

  if (p.activeReport === 'ai-agents') {
    const catWhere = p.categoryFilter !== 'all' ? `\n   AND category = ${q(p.categoryFilter)}` : '';
    const cols = p.activeFields.map(k => {
      if (k === 'agent')      return `  COALESCE(NULLIF(TRIM(ai_agent), ''), 'Unassigned') AS "AI Agent"`;
      if (k === 'count')      return `  COUNT(*) AS "Process Count"`;
      if (k === 'categories') return `  COUNT(DISTINCT category) AS "Categories Covered"`;
      if (k === 'processes')  return `  STRING_AGG(process_short_name, ', ' ORDER BY process_short_name) AS "Processes"`;
      return `  ${FIELD_TO_SQL_COL[k] ?? k}`;
    }).join(',\n');
    const sortMap: Record<string, string> = { agent: '"AI Agent"', count: 'COUNT(*)', categories: 'COUNT(DISTINCT category)', processes: 'COUNT(*)' };
    const ob = p.sortKey ? `ORDER BY ${sortMap[p.sortKey] ?? p.sortKey} ${p.sortDir.toUpperCase()}` : 'ORDER BY COUNT(*) DESC';
    return `SELECT\n${cols}\nFROM processes\nWHERE tenant_id = :tenant_id${catWhere}\nGROUP BY COALESCE(NULLIF(TRIM(ai_agent), ''), 'Unassigned')\n${ob}`;
  }

  if (p.activeReport === 'kpi') {
    const cols = p.activeFields.map(k => {
      if (k === 'processId')   return `  'PRO-' || LPAD(number::text, 3, '0') AS "Process ID"`;
      if (k === 'processName') return `  process_short_name AS "Process Name"`;
      if (k === 'category')    return `  category AS "Category"`;
      if (k === 'kpi')         return `  kpi AS "KPI"`;
      if (k === 'target')      return `  target AS "Target"`;
      if (k === 'achievement') return `  achievement AS "Achievement"`;
      if (k === 'trafficLight') return `  traffic_light AS "Traffic Light"`;
      return `  ${FIELD_TO_SQL_COL[k] ?? k}`;
    }).join(',\n');
    return `SELECT\n${cols}\nFROM processes\n${where}\n${buildOrderBy(p.sortKey, p.sortDir, 'number ASC')}`;
  }

  if (p.activeReport === 'value') {
    const cols = p.activeFields.map(k => {
      if (k === 'processId')   return `  'PRO-' || LPAD(number::text, 3, '0') AS "Process ID"`;
      if (k === 'processName') return `  process_short_name AS "Process Name"`;
      if (k === 'category')    return `  category AS "Category"`;
      if (k === 'valueImpact') return `  estimated_value_impact AS "Estimated Value Impact"`;
      if (k === 'benchmark')   return `  industry_benchmark AS "Industry Benchmark"`;
      return `  ${FIELD_TO_SQL_COL[k] ?? k}`;
    }).join(',\n');
    return `SELECT\n${cols}\nFROM processes\n${where}\n${buildOrderBy(p.sortKey, p.sortDir, 'number ASC')}`;
  }

  if (p.activeReport === 'portfolio') {
    const cols = p.activeFields.map(k => {
      if (k === 'processId')      return `  'PRO-' || LPAD(number::text, 3, '0') AS "Process ID"`;
      if (k === 'category')       return `  category AS "Category"`;
      if (k === 'processName')    return `  process_short_name AS "Process Name"`;
      if (k === 'inPortfolio')    return `  CASE WHEN included THEN 'Yes' ELSE 'No' END AS "In Portfolio"`;
      if (k === 'purpose')        return `  purpose AS "Purpose"`;
      if (k === 'inputs')         return `  inputs AS "Inputs"`;
      if (k === 'outputs')        return `  outputs AS "Outputs"`;
      if (k === 'humanInTheLoop') return `  human_in_the_loop AS "Human-in-the-Loop"`;
      return `  ${FIELD_TO_SQL_COL[k] ?? k}`;
    }).join(',\n');
    return `SELECT\n${cols}\nFROM processes\n${where}\n${buildOrderBy(p.sortKey, p.sortDir, 'number ASC')}`;
  }

  if (p.activeCustomReport) {
    const cols = p.activeCustomReport.fields.map(k => {
      const col = FIELD_TO_SQL_COL[k] ?? k;
      const label = k.replace(/([A-Z])/g, ' $1').trim();
      if (k === 'processId') return `  'PRO-' || LPAD(number::text, 3, '0') AS "Process ID"`;
      if (k === 'inPortfolio') return `  CASE WHEN included THEN 'Yes' ELSE 'No' END AS "In Portfolio"`;
      if (k === 'fieldsFilled') return `  -- "Fields Filled" computed in application`;
      if (k === 'completeness') return `  ${COMPLETENESS_SQL} AS "Completeness %"`;
      if (k === 'status')      return `  CASE WHEN ${COMPLETENESS_SQL} >= 80 THEN 'Complete'\n       WHEN ${COMPLETENESS_SQL} >= 50 THEN 'Partial' ELSE 'Sparse' END AS "Status"`;
      return `  ${col} AS "${label}"`;
    }).join(',\n');
    return `-- Custom Report: ${p.activeCustomReport.name}\nSELECT\n${cols}\nFROM processes\n${where}\n${buildOrderBy(p.sortKey, p.sortDir, 'number ASC')}`;
  }

  return `SELECT * FROM processes WHERE tenant_id = :tenant_id`;
}

function SqlQueryBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const highlighted = sql.split('\n').map((line, i) => {
    const keywords = /\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|HAVING|CASE|WHEN|THEN|ELSE|END|AS|ILIKE|LIKE|NOT|IN|IS|NULL|TRUE|FALSE|ROUND|AVG|COUNT|FILTER|MIN|MAX|SUM|DISTINCT|LPAD|TRIM|NULLIF|COALESCE|STRING_AGG)\b/g;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    keywords.lastIndex = 0;
    const lineUpper = line;
    while ((m = keywords.exec(lineUpper)) !== null) {
      if (m.index > last) parts.push(<span key={`t${last}`}>{line.slice(last, m.index)}</span>);
      parts.push(<span key={`k${m.index}`} className="text-sky-400 font-semibold">{m[0]}</span>);
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(<span key={`t${last}`}>{line.slice(last)}</span>);

    const isComment = line.trim().startsWith('--');
    return (
      <div key={i} className={cn('leading-relaxed', isComment ? 'text-muted-foreground/50 italic' : '')}>
        {isComment ? <span className="text-muted-foreground/50">{line}</span> : parts}
      </div>
    );
  });

  return (
    <div className="rounded-xl border border-border bg-[hsl(var(--card))] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Code2 className="w-3.5 h-3.5 text-primary" />
          Generated SQL
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">PostgreSQL</span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        >
          {copied ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></> : <><Copy className="w-3 h-3" />Copy</>}
        </button>
      </div>
      <pre className="px-5 py-4 text-[12px] font-mono overflow-x-auto leading-5 text-foreground/90 whitespace-pre">
        {highlighted}
      </pre>
    </div>
  );
}

// Inline filter builder row
function FilterBuilderRow({ categories, onAdd, onCancel }: {
  categories: string[];
  onAdd: (rule: Omit<FilterRule, 'id'>) => void;
  onCancel: () => void;
}) {
  const [field, setField] = useState(FILTER_FIELDS[0].key);
  const [operator, setOperator] = useState(OPERATORS_BY_TYPE[FILTER_FIELDS[0].type][0].value);
  const [value, setValue] = useState('');

  const fieldDef = FILTER_FIELDS.find(f => f.key === field) ?? FILTER_FIELDS[0];
  const operators = OPERATORS_BY_TYPE[fieldDef.type];
  const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(operator);

  function handleFieldChange(newField: string) {
    const newDef = FILTER_FIELDS.find(f => f.key === newField) ?? FILTER_FIELDS[0];
    const newOps = OPERATORS_BY_TYPE[newDef.type];
    setField(newField);
    setOperator(newOps[0].value);
    setValue('');
  }

  function handleAdd() {
    if (needsValue && !value.trim()) return;
    onAdd({ field, operator, value: value.trim() });
    setValue('');
  }

  // Resolve dropdown options for categorical or category
  const dropdownOptions: { value: string; label: string }[] | null =
    field === 'category'
      ? categories.map(c => ({ value: c, label: c }))
      : fieldDef.options ?? null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Field */}
      <select
        value={field}
        onChange={e => handleFieldChange(e.target.value)}
        className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        {FILTER_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      {/* Operator */}
      <select
        value={operator}
        onChange={e => setOperator(e.target.value)}
        className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Value */}
      {needsValue && (
        dropdownOptions ? (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="">Select…</option>
            {dropdownOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type={fieldDef.type === 'numeric' ? 'number' : 'text'}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onCancel(); }}
            placeholder={fieldDef.type === 'numeric' ? '0' : 'value…'}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-32"
          />
        )
      )}

      <button
        onClick={handleAdd}
        disabled={needsValue && !value.trim()}
        className="px-2.5 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
      >
        Add
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function completeness(p: Process): number {
  const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim() !== '').length;
  return Math.round((filled / TRACKABLE_FIELDS.length) * 100);
}

function processId(n: number) { return `PRO-${n.toString().padStart(3, '0')}`; }

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 80) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">Complete</span>;
  if (pct >= 50) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 font-semibold">Partial</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/15 text-red-400 font-semibold">Sparse</span>;
}

function TrafficLightBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-muted-foreground/40 text-xs italic">—</span>;
  const map: Record<string, { dot: string; label: string; bg: string; text: string }> = {
    green:  { dot: 'bg-green-500',  label: 'On Track',  bg: 'bg-green-500/15',  text: 'text-green-400' },
    orange: { dot: 'bg-amber-400',  label: 'At Risk',   bg: 'bg-amber-400/15',  text: 'text-amber-400' },
    red:    { dot: 'bg-red-500',    label: 'Off Track', bg: 'bg-red-500/15',    text: 'text-red-400' },
  };
  const m = map[value];
  if (!m) return <span className="text-muted-foreground/40 text-xs italic">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded font-semibold", m.bg, m.text)}>
      <span className={cn("w-2 h-2 rounded-full inline-block shrink-0", m.dot)} />
      {m.label}
    </span>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  const resolvedTitle = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <th title={resolvedTitle} className={cn("text-left px-4 py-3 text-xs font-semibold text-muted-foreground bg-secondary/50 border-b border-border whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-4 py-3 border-b border-border/50 text-sm", className)}>{children}</td>
  );
}

type ReorderFn = (fromKey: string, toKey: string, side: 'before' | 'after') => void;

function DraggableTh({ fieldKey, children, className, onReorder, isActive, sortDir: activeSortDir, onSort }: {
  fieldKey: string;
  children: React.ReactNode;
  className?: string;
  onReorder: ReorderFn;
  isActive?: boolean;
  sortDir?: 'asc' | 'desc';
  onSort?: () => void;
}) {
  const [dragOverSide, setDragOverSide] = useState<'before' | 'after' | null>(null);
  const dragOverSideRef = useRef<'before' | 'after' | null>(null);

  function setSide(side: 'before' | 'after' | null) {
    dragOverSideRef.current = side;
    setDragOverSide(side);
  }

  return (
    <th
      draggable
      title={typeof children === 'string' ? children : undefined}
      onClick={() => onSort?.()}
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', fieldKey);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        setSide(e.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setSide(null);
      }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        const fromKey = e.dataTransfer.getData('text/plain');
        const side = dragOverSideRef.current;
        setSide(null);
        if (fromKey && fromKey !== fieldKey && side) onReorder(fromKey, fieldKey, side);
      }}
      onDragEnd={() => setSide(null)}
      className={cn(
        "relative text-left px-4 py-3 text-xs font-semibold bg-secondary/50 border-b border-border whitespace-nowrap cursor-grab active:cursor-grabbing select-none transition-colors",
        isActive ? "text-primary" : "text-muted-foreground",
        onSort && "hover:text-foreground",
        className,
      )}
    >
      {dragOverSide && (
        <div
          className="absolute inset-y-0 w-0.5 bg-primary z-20 pointer-events-none shadow-[0_0_6px_2px_hsl(var(--primary)/0.5)]"
          style={{ [dragOverSide === 'before' ? 'left' : 'right']: 0 }}
        />
      )}
      <span className="inline-flex items-center gap-1 pointer-events-none">
        {children}
        {onSort && (
          <span className={cn("text-[9px] leading-none", isActive ? "text-primary" : "text-muted-foreground/30")}>
            {isActive ? (activeSortDir === 'asc' ? '↑' : '↓') : '⇅'}
          </span>
        )}
      </span>
    </th>
  );
}

// ─── Detail panels ─────────────────────────────────────────────────────────────

function RPanelTextField({ label, value, onSave, multiline }: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<any>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  function save() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
    if (e.key === 'Enter' && !e.shiftKey && !multiline) { e.preventDefault(); save(); }
  }

  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">{label}</div>
      {editing ? (
        multiline ? (
          <textarea
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={handleKey}
            className="w-full px-3 py-2 text-sm border border-primary/40 bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y min-h-[72px] leading-relaxed"
          />
        ) : (
          <input
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={handleKey}
            className="w-full px-3 py-2 text-sm border border-primary/40 bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )
      ) : (
        <div
          onClick={() => setEditing(true)}
          className={cn(
            "text-sm rounded-lg bg-secondary/30 px-3 py-2 border border-border/50 min-h-[38px] cursor-text hover:border-primary/30 hover:bg-secondary/50 transition-all whitespace-pre-wrap break-words leading-relaxed",
            !value && "italic text-muted-foreground/40"
          )}
        >
          {value || 'Click to edit…'}
        </div>
      )}
    </div>
  );
}

function ProcessDetailPanel({ process: initialProcess, onClose }: { process: Process; onClose: () => void }) {
  const { data: allProcesses = [] } = useListProcesses();
  const process = (allProcesses.find((p: Process) => p.id === initialProcess.id) ?? initialProcess) as Process;
  const { mutate: updateProcess } = useOptimisticUpdateProcess();
  const { data: categories = [] } = useCategoriesData();

  const pct = completeness(process);
  const filled = TRACKABLE_FIELDS.filter(f => process[f] && String(process[f]).trim()).length;

  const CYCLE = ['', 'green', 'orange', 'red'] as const;
  const tlColorMap: Record<string, { bg: string; glow: string; label: string }> = {
    green:  { bg: 'bg-green-500', glow: '0 0 8px rgba(34,197,94,0.7)',  label: 'On Track' },
    orange: { bg: 'bg-amber-400', glow: '0 0 8px rgba(251,191,36,0.7)', label: 'At Risk' },
    red:    { bg: 'bg-red-500',   glow: '0 0 8px rgba(239,68,68,0.7)',  label: 'Off Track' },
  };
  const tl = (process as any).trafficLight as string ?? '';
  const nextTl = CYCLE[(CYCLE.indexOf(tl as any) + 1) % CYCLE.length];
  const tlMeta = tl ? tlColorMap[tl] : null;

  function save(field: string, value: string | boolean | number) {
    updateProcess({ id: process.id, data: { [field]: value } as any });
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40 backdrop-blur-sm" />
      <div
        className="w-[500px] h-full bg-card border-l border-border shadow-2xl overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                {processId(process.number)}
              </span>
              {process.included && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">Portfolio</span>
              )}
              <StatusBadge pct={pct} />
            </div>
            <h3 className="text-base font-semibold text-foreground leading-snug">
              {process.processName || <span className="italic text-muted-foreground">Unnamed process</span>}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{process.category}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Completeness bar */}
        <div className="px-5 py-3 border-b border-border/50 bg-secondary/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Data Completeness</span>
            <span className="text-xs font-medium">{filled}/{TRACKABLE_FIELDS.length} fields · {pct}%</span>
          </div>
          <CompletenessBar pct={pct} />
        </div>

        {/* Editable fields */}
        <div className="flex-1 p-5 space-y-4">
          {/* Category – dropdown */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Category</div>
            <select
              value={process.category}
              onChange={e => save('category', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border/50 bg-secondary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 cursor-pointer hover:border-primary/30 hover:bg-secondary/50 transition-all"
            >
              {(categories as string[]).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Status – cycling traffic light */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Status</div>
            <div
              className="flex items-center gap-3 rounded-lg bg-secondary/30 px-3 py-2.5 border border-border/50 hover:border-primary/30 hover:bg-secondary/50 transition-all cursor-pointer"
              onClick={() => save('trafficLight', nextTl)}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex-shrink-0 transition-all duration-200",
                  tlMeta ? `${tlMeta.bg} border-2 border-transparent` : "border-2 border-dashed border-muted-foreground/30"
                )}
                style={tlMeta ? { boxShadow: tlMeta.glow } : undefined}
              />
              <span className="text-sm">{tlMeta ? tlMeta.label : <em className="text-muted-foreground/40 not-italic">None — click to set</em>}</span>
            </div>
          </div>

          {/* In Portfolio – toggle */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">In Portfolio</div>
            <button
              onClick={() => save('included', !process.included)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border w-full text-left",
                process.included
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-secondary/30 border-border/50 text-muted-foreground hover:border-primary/30 hover:bg-secondary/50"
              )}
            >
              <span className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                process.included ? "bg-green-500 border-green-500" : "border-muted-foreground/40"
              )}>
                {process.included && (
                  <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-none stroke-white stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                    <polyline points="1,4 3.5,6.5 9,1" />
                  </svg>
                )}
              </span>
              {process.included ? 'Yes – included in portfolio' : 'No – excluded from portfolio'}
            </button>
          </div>

          <div className="border-t border-border/50 pt-4 space-y-4">
            <RPanelTextField label="Process Name"       value={process.processName ?? ''}          onSave={v => save('processName', v)} />
            <RPanelTextField label="Description"        value={process.processDescription ?? ''}   onSave={v => save('processDescription', v)} multiline />
            <RPanelTextField label="AI Agent"           value={process.aiAgent ?? ''}              onSave={v => save('aiAgent', v)} />
            <RPanelTextField label="Purpose"            value={process.purpose ?? ''}              onSave={v => save('purpose', v)} multiline />
            <RPanelTextField label="Inputs"             value={process.inputs ?? ''}               onSave={v => save('inputs', v)} multiline />
            <RPanelTextField label="Outputs"            value={process.outputs ?? ''}              onSave={v => save('outputs', v)} multiline />
            <RPanelTextField label="Human-in-the-Loop"  value={process.humanInTheLoop ?? ''}       onSave={v => save('humanInTheLoop', v)} multiline />
            <RPanelTextField label="KPI"                value={process.kpi ?? ''}                  onSave={v => save('kpi', v)} />
            <RPanelTextField label="Target"             value={process.target ?? ''}               onSave={v => save('target', v)} />
            <RPanelTextField label="Achievement"        value={process.achievement ?? ''}          onSave={v => save('achievement', v)} />
            <RPanelTextField label="Estimated Value Impact" value={process.estimatedValueImpact ?? ''} onSave={v => save('estimatedValueImpact', v)} />
            <RPanelTextField label="Industry Benchmark" value={process.industryBenchmark ?? ''}    onSave={v => save('industryBenchmark', v)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupDetailPanel({ title, subtitle, processes, onClose }: {
  title: string;
  subtitle?: string;
  processes: Process[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40 backdrop-blur-sm" />
      <div
        className="w-[460px] h-full bg-card border-l border-border shadow-2xl overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="min-w-0 flex-1">
            {subtitle && (
              <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">{subtitle}</div>
            )}
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-xs text-muted-foreground">{processes.length} processes</span>
              <span className="text-xs text-green-400">{processes.filter(p => p.included).length} in portfolio</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Process list */}
        <div className="flex-1 divide-y divide-border/40">
          {processes.map(p => {
            const pct = completeness(p);
            return (
              <div key={p.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="font-mono text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">
                        {processId(p.number)}
                      </span>
                      {p.included && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold shrink-0">Portfolio</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {p.processName || <em className="text-muted-foreground">Unnamed</em>}
                    </div>
                    {p.processDescription && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{p.processDescription}</div>
                    )}
                  </div>
                  <StatusBadge pct={pct} />
                </div>
                <CompletenessBar pct={pct} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function loadFieldConfig(): Record<ReportId, string[]> {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Record<ReportId, string[]>>;
      const result = { ...DEFAULT_ACTIVE };
      for (const id of REPORT_TYPES.map(r => r.id)) {
        if (parsed[id] && parsed[id]!.length > 0) result[id] = parsed[id]!;
      }
      return result;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_ACTIVE };
}

// ─── Custom report types & helpers ─────────────────────────────────────────────

type CustomReportDef = {
  id: number;
  name: string;
  description: string;
  fields: string[];
  aiPrompt: string;
  createdAt: string;
  isOwner?: boolean;
  canEdit?: boolean;
  shares?: unknown[];
};

const CUSTOM_REPORT_ALL_FIELDS: FieldDef[] = [
  { key: 'processId',            label: 'Process ID' },
  { key: 'category',             label: 'Category' },
  { key: 'processName',          label: 'Process Name' },
  { key: 'description',          label: 'Description' },
  { key: 'aiAgent',              label: 'AI Agent' },
  { key: 'purpose',              label: 'Purpose' },
  { key: 'inputs',               label: 'Inputs' },
  { key: 'outputs',              label: 'Outputs' },
  { key: 'humanInTheLoop',       label: 'Human-in-the-Loop' },
  { key: 'kpi',                  label: 'KPI' },
  { key: 'target',               label: 'Target' },
  { key: 'achievement',          label: 'Achievement' },
  { key: 'trafficLight',         label: 'Traffic Light' },
  { key: 'estimatedValueImpact', label: 'Value Impact' },
  { key: 'industryBenchmark',    label: 'Benchmark' },
  { key: 'included',             label: 'In Portfolio' },
  { key: 'completeness',         label: 'Completeness' },
  { key: 'status',               label: 'Status' },
  { key: 'fieldsFilled',         label: 'Fields Filled' },
];


const TL_ORDER: Record<string, number> = { green: 3, orange: 2, red: 1 };

function sortProcesses(ps: Process[], key: string | null, dir: 'asc' | 'desc'): Process[] {
  if (!key) return ps;
  const m = dir === 'asc' ? 1 : -1;
  return [...ps].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0;
    switch (key) {
      case 'processId':    av = a.number;                         bv = b.number; break;
      case 'category':     av = a.category ?? '';                  bv = b.category ?? ''; break;
      case 'processName':  av = a.processName ?? '';               bv = b.processName ?? ''; break;
      case 'description':  av = a.processDescription ?? '';        bv = b.processDescription ?? ''; break;
      case 'fieldsFilled':
      case 'completeness':
      case 'status':       av = completeness(a);                   bv = completeness(b); break;
      case 'trafficLight': av = TL_ORDER[(a as any).trafficLight] ?? 0; bv = TL_ORDER[(b as any).trafficLight] ?? 0; break;
      case 'kpi':          av = a.kpi ?? '';                       bv = b.kpi ?? ''; break;
      case 'target':       av = a.target ?? '';                    bv = b.target ?? ''; break;
      case 'achievement':  av = a.achievement ?? '';               bv = b.achievement ?? ''; break;
      case 'value':        av = a.estimatedValueImpact ?? '';      bv = b.estimatedValueImpact ?? ''; break;
      case 'benchmark':    av = a.industryBenchmark ?? '';         bv = b.industryBenchmark ?? ''; break;
      case 'included':     av = a.included ? 1 : 0;               bv = b.included ? 1 : 0; break;
      case 'aiAgent':      av = a.aiAgent ?? '';                   bv = b.aiAgent ?? ''; break;
      default:             return 0;
    }
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * m;
    return String(av).localeCompare(String(bv)) * m;
  });
}

// ─── Custom report renderer ─────────────────────────────────────────────────────

function renderCustomCellExport(p: Process, key: string): unknown {
  const pct = completeness(p);
  const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length;
  switch (key) {
    case 'processId':            return processId(p.number);
    case 'category':             return p.category;
    case 'processName':          return p.processName;
    case 'description':          return p.processDescription;
    case 'aiAgent':              return p.aiAgent || '';
    case 'purpose':              return p.purpose || '';
    case 'inputs':               return p.inputs || '';
    case 'outputs':              return p.outputs || '';
    case 'humanInTheLoop':       return p.humanInTheLoop || '';
    case 'kpi':                  return p.kpi || '';
    case 'target':               return p.target || '';
    case 'achievement':          return p.achievement || '';
    case 'trafficLight':         return p.trafficLight === 'green' ? 'On Track' : p.trafficLight === 'orange' ? 'At Risk' : p.trafficLight === 'red' ? 'Off Track' : '';
    case 'estimatedValueImpact': return p.estimatedValueImpact || '';
    case 'industryBenchmark':    return p.industryBenchmark || '';
    case 'included':             return p.included ? 'Yes' : 'No';
    case 'completeness':         return `${pct}%`;
    case 'status':               return pct >= 80 ? 'Complete' : pct >= 50 ? 'Partial' : 'Sparse';
    case 'fieldsFilled':         return `${filled}/${TRACKABLE_FIELDS.length}`;
    default:                     return '';
  }
}

function renderCustomCell(p: Process, key: string): React.ReactNode {
  const pct = completeness(p);
  const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length;
  switch (key) {
    case 'processId':            return <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'category':             return <span className="text-xs">{p.category}</span>;
    case 'processName':          return <span className="font-medium">{p.processName}</span>;
    case 'description':          return <span className="text-muted-foreground text-xs line-clamp-2">{p.processDescription || '—'}</span>;
    case 'aiAgent':              return <span className="text-xs">{p.aiAgent || <em className="opacity-40">—</em>}</span>;
    case 'purpose':              return <span className="text-xs text-muted-foreground line-clamp-2">{p.purpose || '—'}</span>;
    case 'inputs':               return <span className="text-xs text-muted-foreground">{p.inputs || '—'}</span>;
    case 'outputs':              return <span className="text-xs text-muted-foreground">{p.outputs || '—'}</span>;
    case 'humanInTheLoop':       return <span className="text-xs text-muted-foreground">{p.humanInTheLoop || '—'}</span>;
    case 'kpi':                  return <span className="text-xs">{p.kpi || '—'}</span>;
    case 'target':               return <span className="text-xs">{p.target || '—'}</span>;
    case 'achievement':          return <span className="text-xs">{p.achievement || '—'}</span>;
    case 'trafficLight':         return <TrafficLightBadge value={p.trafficLight} />;
    case 'estimatedValueImpact': return <span className="text-xs">{p.estimatedValueImpact || '—'}</span>;
    case 'industryBenchmark':    return <span className="text-xs">{p.industryBenchmark || '—'}</span>;
    case 'included':             return p.included ? <span className="text-xs text-green-400 font-semibold">Yes</span> : <span className="text-xs text-muted-foreground">No</span>;
    case 'completeness':         return <CompletenessBar pct={pct} />;
    case 'status':               return <StatusBadge pct={pct} />;
    case 'fieldsFilled':         return <span className="text-xs text-muted-foreground">{filled}/{TRACKABLE_FIELDS.length}</span>;
    default:                     return null;
  }
}

function CustomReport({ report, processes, sortKey, sortDir, onSortChange, onRowClick, onReorderField }: {
  report: CustomReportDef;
  processes: Process[];
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  onSortChange: (key: string) => void;
  onRowClick?: (p: Process) => void;
  onReorderField: ReorderFn;
}) {
  const sorted = sortProcesses(processes, sortKey, sortDir);
  const fieldDefs = report.fields.map(k => CUSTOM_REPORT_ALL_FIELDS.find(f => f.key === k) ?? { key: k, label: k });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-1">
        <div>
          <h3 className="font-display font-semibold text-foreground">{report.name}</h3>
          {report.description && <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{sorted.length} processes</span>
      </div>
      <TableWrapper>
        <thead>
          <tr>
            {fieldDefs.map(f => (
              <DraggableTh key={f.key} fieldKey={f.key} onReorder={onReorderField} isActive={sortKey === f.key} sortDir={sortDir} onSort={() => onSortChange(f.key)}>
                {f.label}
              </DraggableTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => onRowClick?.(p)}>
              {fieldDefs.map(f => <Td key={f.key}>{renderCustomCell(p, f.key)}</Td>)}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><Td colSpan={fieldDefs.length} className="text-center text-muted-foreground/60 py-8 italic">No processes match the current filter.</Td></tr>
          )}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function ReportSemanticDescription({ fields }: { fields: string[] }) {
  const labels = fields.map(k => CUSTOM_REPORT_ALL_FIELDS.find(f => f.key === k)?.label ?? k);
  if (labels.length === 0) return null;
  return (
    <div className="rounded-xl bg-secondary/40 border border-border px-3 py-2.5 text-xs">
      <span className="font-semibold text-foreground">Read-only query: </span>
      <span className="text-muted-foreground">
        Table showing {labels.length} column{labels.length !== 1 ? 's' : ''}: {labels.join(', ')}.
      </span>
    </div>
  );
}

function NewReportModal({ onClose, onCreate, initialValues, isEdit }: {
  onClose: () => void;
  onCreate: (name: string, description: string, fields: string[], aiPrompt: string) => void;
  initialValues?: { name: string; description: string; fields: string[]; aiPrompt: string };
  isEdit?: boolean;
}) {
  const { fetchHeaders } = useUser();
  const [mode, setMode] = useState<'ai' | 'manual'>(initialValues?.aiPrompt ? 'ai' : (isEdit ? 'manual' : 'ai'));
  const [prompt, setPrompt] = useState(initialValues?.aiPrompt ?? '');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [selectedFields, setSelectedFields] = useState<string[]>(initialValues?.fields ?? ['processId', 'category', 'processName', 'description']);
  const [aiConfigured, setAiConfigured] = useState(isEdit && !!initialValues?.name);

  function toggleField(key: string) {
    setSelectedFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function handleCreate() {
    if (!name.trim() || selectedFields.length === 0) return;
    onCreate(name.trim(), description.trim(), selectedFields, mode === 'ai' ? prompt.trim() : '');
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenError(null);
    try {
      const r = await fetch('/api/reports/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setGenError(data.error ?? 'Generation failed'); return; }
      setName(data.name ?? '');
      setDescription(data.description ?? '');
      setSelectedFields(data.fields ?? []);
      setAiConfigured(true);
    } catch {
      setGenError('Network error — please try again');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border flex-none">
          <div>
            <h3 className="font-display font-bold text-lg">{isEdit ? 'Edit Report' : 'New Custom Report'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{isEdit ? 'Update the report name, columns or AI prompt' : 'Describe what you want or configure manually'}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-3 border-b border-border flex-none bg-secondary/20">
          <button
            onClick={() => setMode('ai')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              mode === 'ai' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask AI
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              mode === 'manual' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Manual
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* AI mode */}
          {mode === 'ai' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Describe your report</label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">Tell the AI what you want to see. It will name the report and pick the right columns for you.</p>
                <textarea
                  autoFocus
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                  placeholder={`e.g. "Show me all processes with their KPIs and traffic lights"\n"A report on AI agent assignments and automation status"\n"Processes with value impact and benchmarks for board review"`}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              {genError && (
                <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{genError}</p>
              )}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {generating ? <><RotateCcw className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Report Configuration</>}
              </button>

              {/* AI-generated preview */}
              {aiConfigured && !generating && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Generated Configuration — review &amp; edit below
                  </div>
                  <div className="w-0.5 self-stretch" />
                </div>
              )}
            </div>
          )}

          {/* Name + description (shown always after AI run, or in manual mode) */}
          {(mode === 'manual' || aiConfigured) && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Report Name *</label>
                <input
                  autoFocus={mode === 'manual'}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose(); }}
                  placeholder="e.g. High Priority Processes"
                  className="mt-1.5 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1.5 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Columns <span className="text-primary font-bold">({selectedFields.length} selected)</span>
                  </label>
                  <div className="flex gap-3">
                    <button onClick={() => setSelectedFields(CUSTOM_REPORT_ALL_FIELDS.map(f => f.key))} className="text-xs text-primary hover:underline">All</button>
                    <button onClick={() => setSelectedFields([])} className="text-xs text-muted-foreground hover:underline">None</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {CUSTOM_REPORT_ALL_FIELDS.map(f => {
                    const active = selectedFields.includes(f.key);
                    return (
                      <button
                        key={f.key}
                        onClick={() => toggleField(f.key)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-xs transition-all",
                          active
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-secondary/30 text-muted-foreground border border-transparent hover:border-border hover:text-foreground"
                        )}
                      >
                        <span className={cn("w-3 h-3 rounded-sm border-2 shrink-0 flex items-center justify-center", active ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                          {active && <svg viewBox="0 0 8 7" className="w-2 h-2 fill-none stroke-white stroke-[1.5] stroke-linecap-round stroke-linejoin-round"><polyline points="1,3.5 3,5.5 7,1" /></svg>}
                        </span>
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {(mode === 'manual' || aiConfigured) && selectedFields.length > 0 && (
          <div className="px-5 pb-1 flex-none">
            <ReportSemanticDescription fields={selectedFields} />
          </div>
        )}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border flex-none">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
          {(mode === 'manual' || aiConfigured) && (
            <button
              onClick={handleCreate}
              disabled={!name.trim() || selectedFields.length === 0}
              className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isEdit ? 'Update Report' : 'Create Report'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ReportsView ───────────────────────────────────────────────────────────

export function ReportsView() {
  const { data: processes = [] } = useListProcesses();
  const { fetchHeaders, currentUser } = useUser();
  const [activeReport, setActiveReport] = useState<string>('coverage');
  const [customReports, setCustomReports] = useState<CustomReportDef[]>([]);
  const [customReportsLoading, setCustomReportsLoading] = useState(true);
  const [showNewReport, setShowNewReport] = useState(false);
  const [editingReport, setEditingReport] = useState<CustomReportDef | null>(null);
  const [sharingReportId, setSharingReportId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFieldPanel, setShowFieldPanel] = useState(false);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<Record<ReportId, string[]>>(loadFieldConfig);
  const [showSql, setShowSql] = useState(false);

  const sharingReport = customReports.find(r => r.id === sharingReportId) ?? null;

  const fetchCustomReports = useCallback(async () => {
    try {
      const res = await fetch(`${API}/reports`, { headers: fetchHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomReports(data.map((r: any) => ({
          id: r.id,
          name: r.title,
          description: r.description ?? '',
          fields: r.fields ?? [],
          aiPrompt: r.aiPrompt ?? '',
          createdAt: r.createdAt ?? new Date().toISOString(),
          isOwner: r.isOwner,
          canEdit: r.canEdit,
          shares: r.shares ?? [],
        })));
      }
    } catch { /* ignore */ } finally {
      setCustomReportsLoading(false);
    }
  }, [fetchHeaders]);

  useEffect(() => { fetchCustomReports(); }, [fetchCustomReports]);

  const isBuiltInReport = REPORT_TYPES.some(r => r.id === activeReport);
  const activeCustomReport = isBuiltInReport ? null : customReports.find(r => String(r.id) === activeReport) ?? null;

  const [detailProcess, setDetailProcess] = useState<Process | null>(null);
  const [detailGroup, setDetailGroup] = useState<{ title: string; subtitle?: string; processes: Process[] } | null>(null);

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => { setSortKey(null); setSortDir('asc'); }, [activeReport]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const categories = useMemo(() => {
    const cats = [...new Set((processes as Process[]).map(p => p.category))].sort();
    return cats;
  }, [processes]);

  const filtered = useMemo(() => {
    let ps = processes as Process[];
    if (categoryFilter !== 'all') ps = ps.filter(p => p.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      ps = ps.filter(p =>
        p.processName.toLowerCase().includes(q) ||
        p.processDescription.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }
    ps = applyFilterRules(ps, filterRules);
    return ps.sort((a, b) => a.number - b.number);
  }, [processes, categoryFilter, searchQuery, filterRules]);

  const reportDef = REPORT_TYPES.find(r => r.id === activeReport) ?? null;
  const allFieldDefs = isBuiltInReport ? FIELD_DEFS[activeReport as ReportId] : CUSTOM_REPORT_ALL_FIELDS;
  const activeFields = isBuiltInReport
    ? (fieldConfig[activeReport as ReportId] ?? DEFAULT_ACTIVE[activeReport as ReportId])
    : (activeCustomReport?.fields ?? []);
  const inactiveFields = allFieldDefs.filter(f => !activeFields.includes(f.key));

  function updateFields(newFields: string[]) {
    if (isBuiltInReport) {
      const newConfig = { ...fieldConfig, [activeReport]: newFields };
      setFieldConfig(newConfig);
      localStorage.setItem(LS_KEY, JSON.stringify(newConfig));
    } else if (activeCustomReport) {
      setCustomReports(prev => prev.map(r => r.id === activeCustomReport.id ? { ...r, fields: newFields } : r));
      fetch(`${API}/reports/${activeCustomReport.id}`, {
        method: 'PATCH',
        headers: fetchHeaders(),
        body: JSON.stringify({ fields: newFields }),
      }).catch(() => {});
    }
  }

  function addField(key: string) {
    if (!activeFields.includes(key)) updateFields([...activeFields, key]);
  }

  function removeField(key: string) {
    const next = activeFields.filter(k => k !== key);
    if (next.length === 0) return;
    updateFields(next);
  }

  function resetFields() {
    if (!isBuiltInReport) return;
    updateFields([...DEFAULT_ACTIVE[activeReport as ReportId]]);
  }

  async function createCustomReport(name: string, description: string, fields: string[], aiPrompt: string) {
    try {
      const res = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: fetchHeaders(),
        body: JSON.stringify({ title: name, description, fields, aiPrompt }),
      });
      if (!res.ok) return;
      const r = await res.json();
      const newReport: CustomReportDef = {
        id: r.id,
        name: r.title,
        description: r.description ?? '',
        fields: r.fields ?? [],
        aiPrompt: r.aiPrompt ?? '',
        createdAt: r.createdAt ?? new Date().toISOString(),
        isOwner: true,
        canEdit: true,
        shares: [],
      };
      setCustomReports(prev => [...prev, newReport]);
      setActiveReport(String(r.id));
      setShowNewReport(false);
      setEditingReport(null);
      setShowFieldPanel(false);
    } catch { /* ignore */ }
  }

  async function updateCustomReport(id: number, name: string, description: string, fields: string[], aiPrompt: string) {
    try {
      const res = await fetch(`${API}/reports/${id}`, {
        method: 'PATCH',
        headers: fetchHeaders(),
        body: JSON.stringify({ title: name, description, fields, aiPrompt }),
      });
      if (!res.ok) return;
      const r = await res.json();
      setCustomReports(prev => prev.map(rep => rep.id === id ? {
        ...rep,
        name: r.title ?? name,
        description: r.description ?? description,
        fields: r.fields ?? fields,
        aiPrompt: r.aiPrompt ?? aiPrompt,
      } : rep));
      setEditingReport(null);
      setShowNewReport(false);
    } catch { /* ignore */ }
  }

  async function deleteCustomReport(id: number) {
    try {
      await fetch(`${API}/reports/${id}`, { method: 'DELETE', headers: fetchHeaders() });
      setCustomReports(prev => prev.filter(r => r.id !== id));
      if (activeReport === String(id)) setActiveReport('coverage');
    } catch { /* ignore */ }
  }

  async function duplicateCustomReport(r: CustomReportDef) {
    try {
      const res = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: fetchHeaders(),
        body: JSON.stringify({ title: `Copy of ${r.name}`, description: r.description, fields: r.fields, aiPrompt: r.aiPrompt }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const newReport: CustomReportDef = {
        id: data.id,
        name: data.title,
        description: data.description ?? '',
        fields: data.fields ?? [],
        aiPrompt: data.aiPrompt ?? '',
        createdAt: data.createdAt ?? new Date().toISOString(),
        isOwner: true,
        canEdit: true,
        shares: [],
      };
      setCustomReports(prev => [...prev, newReport]);
      setActiveReport(String(data.id));
    } catch { /* ignore */ }
  }

  function reorderField(fromKey: string, toKey: string, side: 'before' | 'after') {
    if (fromKey === toKey) return;
    const next = [...activeFields];
    const fromIdx = next.indexOf(fromKey);
    next.splice(fromIdx, 1);
    const toIdx = next.indexOf(toKey);
    next.splice(side === 'after' ? toIdx + 1 : toIdx, 0, fromKey);
    updateFields(next);
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOver(index);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) { setDragOver(null); return; }
    const next = [...activeFields];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    updateFields(next);
    dragIndexRef.current = null;
    setDragOver(null);
  }

  function handleDragEnd() {
    dragIndexRef.current = null;
    setDragOver(null);
  }

  function exportReport() {
    let rows: Record<string, unknown>[] = [];
    if (activeReport === 'coverage') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        const pct = completeness(p);
        const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length;
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'description') row['Description'] = p.processDescription;
          else if (key === 'fieldsFilled') row['Fields Filled'] = `${filled}/${TRACKABLE_FIELDS.length}`;
          else if (key === 'completeness') row['Completeness (%)'] = pct;
          else if (key === 'status') row['Status'] = pct >= 80 ? 'Complete' : pct >= 50 ? 'Partial' : 'Sparse';
          else if (key === 'trafficLight') row['Traffic Light'] = p.trafficLight === 'green' ? 'On Track' : p.trafficLight === 'orange' ? 'At Risk' : p.trafficLight === 'red' ? 'Off Track' : '';
        }
        return row;
      });
    } else if (activeReport === 'category') {
      const grouped: Record<string, Process[]> = {};
      (processes as Process[]).forEach(p => { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); });
      rows = Object.entries(grouped).map(([cat, ps]) => {
        const row: Record<string, unknown> = {};
        const avg = Math.round(ps.reduce((s, p) => s + completeness(p), 0) / ps.length);
        const included = ps.filter(p => p.included).length;
        for (const key of activeFields) {
          if (key === 'category') row['Category'] = cat;
          else if (key === 'total') row['Total Processes'] = ps.length;
          else if (key === 'inPortfolio') row['In Portfolio'] = included;
          else if (key === 'excluded') row['Excluded'] = ps.length - included;
          else if (key === 'avgCompleteness') row['Avg Completeness (%)'] = avg;
          else if (key === 'status') row['Status'] = avg >= 80 ? 'Complete' : avg >= 50 ? 'Partial' : 'Sparse';
        }
        return row;
      });
    } else if (activeReport === 'ai-agents') {
      const agentMap: Record<string, Process[]> = {};
      (processes as Process[]).forEach(p => { const a = p.aiAgent?.trim() || 'Unassigned'; if (!agentMap[a]) agentMap[a] = []; agentMap[a].push(p); });
      rows = Object.entries(agentMap).map(([agent, ps]) => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'agent') row['AI Agent'] = agent;
          else if (key === 'count') row['Process Count'] = ps.length;
          else if (key === 'categories') row['Categories Covered'] = [...new Set(ps.map(p => p.category))].join(', ');
          else if (key === 'processes') row['Processes'] = ps.map(p => p.processName).join('; ');
        }
        return row;
      });
    } else if (activeReport === 'kpi') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'kpi') row['KPI'] = p.kpi;
          else if (key === 'target') row['Target'] = p.target;
          else if (key === 'achievement') row['Achievement'] = p.achievement;
          else if (key === 'trafficLight') row['Traffic Light'] = p.trafficLight === 'green' ? 'On Track' : p.trafficLight === 'orange' ? 'At Risk' : p.trafficLight === 'red' ? 'Off Track' : '';
        }
        return row;
      });
    } else if (activeReport === 'value') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'valueImpact') row['Estimated Value Impact'] = p.estimatedValueImpact;
          else if (key === 'benchmark') row['Industry Benchmark'] = p.industryBenchmark;
        }
        return row;
      });
    } else if (activeReport === 'portfolio') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'inPortfolio') row['In Portfolio'] = p.included ? 'Yes' : 'No';
          else if (key === 'purpose') row['Purpose'] = p.purpose;
          else if (key === 'inputs') row['Inputs'] = p.inputs;
          else if (key === 'outputs') row['Outputs'] = p.outputs;
          else if (key === 'humanInTheLoop') row['Human-in-the-Loop'] = p.humanInTheLoop;
        }
        return row;
      });
    } else if (activeCustomReport) {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        for (const key of activeCustomReport.fields) {
          const label = CUSTOM_REPORT_ALL_FIELDS.find(f => f.key === key)?.label ?? key;
          row[label] = renderCustomCellExport(p, key);
        }
        return row;
      });
    }

    const sheetName = reportDef?.label ?? activeCustomReport?.name ?? 'Report';
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName.replace(/\s+/g, '_')}_Report.xlsx`);
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none p-5 border-b border-border bg-card flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-primary" />
            Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Generate and export configurable reports from your process data.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportReport}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 font-medium transition-all"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Report selector */}
        <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col py-4 px-3 gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">Report Types</div>
          {REPORT_TYPES.map(r => {
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => { setActiveReport(r.id); setShowFieldPanel(false); }}
                className={cn(
                  "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all",
                  activeReport === r.id
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", activeReport === r.id ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <div className="text-sm font-medium leading-tight">{r.label}</div>
                  <div className="text-[10px] mt-0.5 text-muted-foreground leading-tight">{r.description}</div>
                </div>
              </button>
            );
          })}

          {/* Custom reports */}
          {customReports.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mt-3 mb-1 pt-2 border-t border-border">Custom Reports</div>
              {customReports.map(r => (
                <div key={r.id} className="group relative">
                  <button
                    onClick={() => { setActiveReport(String(r.id)); setShowFieldPanel(false); }}
                    className={cn(
                      "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all pr-16",
                      activeReport === String(r.id)
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <FileBarChart className={cn("w-4 h-4 mt-0.5 flex-shrink-0 shrink-0", activeReport === String(r.id) ? "text-primary" : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight truncate">{r.name}</div>
                      {r.description && <div className="text-[10px] mt-0.5 text-muted-foreground leading-tight truncate">{r.description}</div>}
                    </div>
                  </button>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex opacity-0 group-hover:opacity-100 transition-all">
                    {r.canEdit && (
                      <button
                        onClick={e => { e.stopPropagation(); setEditingReport(r); }}
                        title="Edit report"
                        className="text-muted-foreground/40 hover:text-primary transition-colors p-1 rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setSharingReportId(r.id); }}
                      title="Share report"
                      className="text-muted-foreground/40 hover:text-primary transition-colors p-1 rounded"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); duplicateCustomReport(r); }}
                      title="Duplicate report"
                      className="text-muted-foreground/40 hover:text-green-400 transition-colors p-1 rounded"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {r.isOwner && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteCustomReport(r.id); }}
                        title="Delete report"
                        className="text-muted-foreground/40 hover:text-red-400 transition-colors p-1 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* New report button */}
          <button
            onClick={() => setShowNewReport(true)}
            className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all border border-dashed border-border hover:border-primary/40"
          >
            <Plus className="w-3.5 h-3.5" />
            New Report
          </button>
        </aside>

        {/* Right: Report content + optional fields panel */}
        <div className="flex-1 flex min-w-0 min-h-0 relative">
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Filters bar */}
            <div className="flex-none px-5 py-3 border-b border-border bg-card/40 space-y-2">
              {/* Row 1: standard controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="relative">
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
                {activeReport !== 'category' && activeReport !== 'ai-agents' && (
                  <div className="relative flex items-center">
                    <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search processes..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 w-52"
                    />
                  </div>
                )}
                {/* Add filter button */}
                <button
                  onClick={() => setShowFilterBuilder(v => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-all",
                    showFilterBuilder || filterRules.length > 0
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Plus className="w-3 h-3" />
                  {filterRules.length > 0 ? `${filterRules.length} filter${filterRules.length !== 1 ? 's' : ''}` : 'Add Filter'}
                </button>
                {filterRules.length > 0 && (
                  <button
                    onClick={() => { setFilterRules([]); setShowFilterBuilder(false); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {activeReport === 'category'
                    ? `${categories.length} categories`
                    : `${filtered.length} processes`}
                </span>
                {/* Fields button */}
                <button
                  onClick={() => setShowFieldPanel(v => !v)}
                  className={cn(
                    "ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all",
                    showFieldPanel
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Fields
                  <span className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold",
                    showFieldPanel ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                  )}>
                    {activeFields.length}
                  </span>
                </button>
                {/* SQL toggle button */}
                <button
                  onClick={() => setShowSql(v => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all",
                    showSql
                      ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  SQL
                </button>
              </div>

              {/* Row 2: active filter chips */}
              {filterRules.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {filterRules.map(rule => (
                    <span
                      key={rule.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium"
                    >
                      {filterRuleLabel(rule)}
                      <button
                        onClick={() => setFilterRules(prev => prev.filter(r => r.id !== rule.id))}
                        className="hover:text-red-400 transition-colors ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Row 3: filter builder */}
              {showFilterBuilder && (
                <div className="pt-1">
                  <FilterBuilderRow
                    categories={categories}
                    onAdd={rule => {
                      setFilterRules(prev => [...prev, { ...rule, id: Math.random().toString(36).slice(2) }]);
                      setShowFilterBuilder(false);
                    }}
                    onCancel={() => setShowFilterBuilder(false)}
                  />
                </div>
              )}
            </div>

            {/* Report content */}
            <div className="flex-1 overflow-auto p-5 space-y-5">
              <div>
                {activeReport === 'coverage'  && <CoverageReport  processes={filtered}               activeFields={activeFields} onRowClick={setDetailProcess} onReorderField={reorderField} sortKey={sortKey} sortDir={sortDir} onSortChange={toggleSort} />}
                {activeReport === 'category'  && <CategoryReport  processes={processes as Process[]} categoryFilter={categoryFilter} activeFields={activeFields} onGroupClick={(title, subtitle, ps) => setDetailGroup({ title, subtitle, processes: ps })} onReorderField={reorderField} sortKey={sortKey} sortDir={sortDir} onSortChange={toggleSort} />}
                {activeReport === 'ai-agents' && <AiAgentReport   processes={processes as Process[]} categoryFilter={categoryFilter} activeFields={activeFields} onGroupClick={(title, subtitle, ps) => setDetailGroup({ title, subtitle, processes: ps })} onReorderField={reorderField} sortKey={sortKey} sortDir={sortDir} onSortChange={toggleSort} />}
                {activeReport === 'kpi'       && <KpiReport       processes={filtered}               activeFields={activeFields} onRowClick={setDetailProcess} onReorderField={reorderField} sortKey={sortKey} sortDir={sortDir} onSortChange={toggleSort} />}
                {activeReport === 'value'     && <ValueReport     processes={filtered}               activeFields={activeFields} onRowClick={setDetailProcess} onReorderField={reorderField} sortKey={sortKey} sortDir={sortDir} onSortChange={toggleSort} />}
                {activeReport === 'portfolio' && <PortfolioReport processes={filtered}               activeFields={activeFields} onRowClick={setDetailProcess} onReorderField={reorderField} sortKey={sortKey} sortDir={sortDir} onSortChange={toggleSort} />}
                {activeCustomReport && (
                  <CustomReport
                    report={activeCustomReport}
                    processes={filtered}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={toggleSort}
                    onRowClick={setDetailProcess}
                    onReorderField={reorderField}
                  />
                )}
              </div>
              {showSql && (
                <SqlQueryBlock sql={generateReportSQL({
                  activeReport,
                  categoryFilter,
                  searchQuery,
                  filterRules,
                  activeFields,
                  sortKey,
                  sortDir,
                  activeCustomReport,
                })} />
              )}
            </div>
          </div>

          {/* Field configuration panel */}
          {showFieldPanel && (
            <div className="w-64 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                  Configure Fields
                </span>
                <div className="flex items-center gap-1">
                  {isBuiltInReport && (
                    <button
                      onClick={resetFields}
                      title="Reset to default"
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowFieldPanel(false)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-5">
                {/* Active fields — draggable */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                    Active Columns ({activeFields.length})
                  </div>
                  <div className="space-y-1">
                    {activeFields.map((key, index) => {
                      const def = allFieldDefs.find(f => f.key === key);
                      if (!def) return null;
                      return (
                        <div
                          key={key}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={e => handleDragOver(e, index)}
                          onDrop={e => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "flex items-center gap-2 px-2 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing group",
                            dragOver === index
                              ? "border-primary/50 bg-primary/10"
                              : "border-border bg-secondary/30 hover:bg-secondary/60"
                          )}
                        >
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 group-hover:text-muted-foreground transition-colors" />
                          <span className="flex-1 text-xs text-foreground font-medium truncate">{def.label}</span>
                          <button
                            onClick={() => removeField(key)}
                            disabled={activeFields.length <= 1}
                            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Available fields — click to add */}
                {inactiveFields.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                      Available to Add
                    </div>
                    <div className="space-y-1">
                      {inactiveFields.map(def => (
                        <button
                          key={def.key}
                          onClick={() => addField(def.key)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all group"
                        >
                          <Plus className="w-3.5 h-3.5 flex-shrink-0 opacity-50 group-hover:opacity-100" />
                          <span className="flex-1 text-xs text-left truncate">{def.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-3 py-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  Drag to reorder. Click <X className="inline w-2.5 h-2.5" /> to hide a column or <Plus className="inline w-2.5 h-2.5" /> to add it back. Changes are saved automatically.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail panels */}
      {detailProcess && (
        <ProcessDetailPanel process={detailProcess} onClose={() => setDetailProcess(null)} />
      )}
      {detailGroup && (
        <GroupDetailPanel
          title={detailGroup.title}
          subtitle={detailGroup.subtitle}
          processes={detailGroup.processes}
          onClose={() => setDetailGroup(null)}
        />
      )}
      {(showNewReport || editingReport) && (
        <NewReportModal
          onClose={() => { setShowNewReport(false); setEditingReport(null); }}
          onCreate={editingReport
            ? (name, desc, fields, aiPrompt) => updateCustomReport(editingReport.id, name, desc, fields, aiPrompt)
            : createCustomReport}
          initialValues={editingReport ? {
            name: editingReport.name,
            description: editingReport.description,
            fields: editingReport.fields,
            aiPrompt: editingReport.aiPrompt,
          } : undefined}
          isEdit={!!editingReport}
        />
      )}
      {sharingReport && (
        <ShareModal
          resourceType="report"
          resourceId={sharingReport.id}
          resourceName={sharingReport.name}
          isOwner={sharingReport.isOwner ?? false}
          initialShares={sharingReport.shares as any}
          onClose={() => setSharingReportId(null)}
          onSaved={fetchCustomReports}
        />
      )}
    </div>
  );
}

function renderCoverageCell(p: Process, field: string): React.ReactNode {
  const pct = completeness(p);
  const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length;
  switch (field) {
    case 'processId':   return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'category':    return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'processName': return <span className="font-medium">{p.processName}</span>;
    case 'description': return <span className="text-xs text-muted-foreground max-w-xs truncate block">{p.processDescription || <em className="opacity-40">—</em>}</span>;
    case 'fieldsFilled':return <span className="text-xs text-muted-foreground">{filled}/{TRACKABLE_FIELDS.length}</span>;
    case 'completeness':  return <CompletenessBar pct={pct} />;
    case 'status':        return <StatusBadge pct={pct} />;
    case 'trafficLight':  return <TrafficLightBadge value={p.trafficLight} />;
    default:              return null;
  }
}

function CoverageReport({ processes, activeFields, onRowClick, onReorderField, sortKey, sortDir, onSortChange }: { processes: Process[]; activeFields: string[]; onRowClick?: (p: Process) => void; onReorderField: ReorderFn; sortKey: string | null; sortDir: 'asc' | 'desc'; onSortChange: (key: string) => void }) {
  const avgCompleteness = processes.length ? Math.round(processes.reduce((s, p) => s + completeness(p), 0) / processes.length) : 0;
  const complete = processes.filter(p => completeness(p) >= 80).length;
  const partial  = processes.filter(p => completeness(p) >= 50 && completeness(p) < 80).length;
  const sparse   = processes.filter(p => completeness(p) < 50).length;

  const fieldDefs = FIELD_DEFS.coverage.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Avg Completeness', value: `${avgCompleteness}%`, color: 'text-primary' },
          { label: 'Complete (≥80%)',  value: complete,              color: 'text-green-400' },
          { label: 'Partial (50–79%)', value: partial,               color: 'text-amber-400' },
          { label: 'Sparse (<50%)',    value: sparse,                color: 'text-red-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <DraggableTh key={f.key} fieldKey={f.key} className={f.key === 'completeness' ? 'w-48' : undefined} onReorder={onReorderField} isActive={sortKey === f.key} sortDir={sortDir} onSort={() => onSortChange(f.key)}>{f.label}</DraggableTh>)}</tr></thead>
        <tbody>
          {sortProcesses(processes, sortKey, sortDir).map(p => (
            <tr
              key={p.id}
              className="hover:bg-secondary/30 transition-colors cursor-pointer"
              onClick={() => onRowClick?.(p)}
            >
              {fieldDefs.map(f => <Td key={f.key} className={f.key === 'completeness' ? 'w-48' : undefined}>{renderCoverageCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderCategoryCell(cat: string, ps: Process[], field: string): React.ReactNode {
  const avg = Math.round(ps.reduce((s, p) => s + completeness(p), 0) / ps.length);
  const included = ps.filter(p => p.included).length;
  switch (field) {
    case 'category':        return <span className="font-medium">{cat}</span>;
    case 'total':           return <span>{ps.length}</span>;
    case 'inPortfolio':     return <span className="text-green-400 font-medium">{included}</span>;
    case 'excluded':        return <span className="text-muted-foreground">{ps.length - included}</span>;
    case 'avgCompleteness': return <CompletenessBar pct={avg} />;
    case 'status':          return <StatusBadge pct={avg} />;
    default:                return null;
  }
}

function CategoryReport({ processes, categoryFilter, activeFields, onGroupClick, onReorderField, sortKey, sortDir, onSortChange }: { processes: Process[]; categoryFilter: string; activeFields: string[]; onGroupClick?: (title: string, subtitle: string, ps: Process[]) => void; onReorderField: ReorderFn; sortKey: string | null; sortDir: 'asc' | 'desc'; onSortChange: (key: string) => void }) {
  const grouped = useMemo(() => {
    const map: Record<string, Process[]> = {};
    processes.forEach(p => { if (!map[p.category]) map[p.category] = []; map[p.category].push(p); });
    let entries = Object.entries(map)
      .filter(([cat]) => categoryFilter === 'all' || cat === categoryFilter);
    if (sortKey) {
      const m = sortDir === 'asc' ? 1 : -1;
      entries = entries.sort(([catA, psA], [catB, psB]) => {
        switch (sortKey) {
          case 'total':           return (psA.length - psB.length) * m;
          case 'inPortfolio':     return (psA.filter(p => p.included).length - psB.filter(p => p.included).length) * m;
          case 'excluded':        return ((psA.length - psA.filter(p => p.included).length) - (psB.length - psB.filter(p => p.included).length)) * m;
          case 'avgCompleteness':
          case 'status': {
            const avgA = psA.length ? psA.reduce((s, p) => s + completeness(p), 0) / psA.length : 0;
            const avgB = psB.length ? psB.reduce((s, p) => s + completeness(p), 0) / psB.length : 0;
            return (avgA - avgB) * m;
          }
          default: return catA.localeCompare(catB) * m;
        }
      });
    } else {
      entries = entries.sort((a, b) => a[0].localeCompare(b[0]));
    }
    return entries;
  }, [processes, categoryFilter, sortKey, sortDir]);

  const fieldDefs = FIELD_DEFS.category.filter(f => activeFields.includes(f.key));

  return (
    <TableWrapper>
      <thead><tr>{fieldDefs.map(f => <DraggableTh key={f.key} fieldKey={f.key} className={f.key === 'avgCompleteness' ? 'w-48' : undefined} onReorder={onReorderField} isActive={sortKey === f.key} sortDir={sortDir} onSort={() => onSortChange(f.key)}>{f.label}</DraggableTh>)}</tr></thead>
      <tbody>
        {grouped.map(([cat, ps]) => (
          <tr
            key={cat}
            className="hover:bg-secondary/30 transition-colors cursor-pointer"
            onClick={() => onGroupClick?.(cat, 'Category', ps)}
          >
            {fieldDefs.map(f => <Td key={f.key} className={f.key === 'avgCompleteness' ? 'w-48' : undefined}>{renderCategoryCell(cat, ps, f.key)}</Td>)}
          </tr>
        ))}
      </tbody>
    </TableWrapper>
  );
}

function renderAgentCell(agent: string, ps: Process[], field: string): React.ReactNode {
  switch (field) {
    case 'agent':      return <span className={cn("font-medium", agent === 'Unassigned' ? "text-muted-foreground italic" : "text-foreground")}>{agent}</span>;
    case 'count':      return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">{ps.length}</span>;
    case 'categories': return <span className="text-xs text-muted-foreground">{[...new Set(ps.map(p => p.category))].join(', ')}</span>;
    case 'processes':  return <span className="text-xs text-muted-foreground max-w-xs truncate block">{ps.map(p => p.processName).join(', ')}</span>;
    default:           return null;
  }
}

function AiAgentReport({ processes, categoryFilter, activeFields, onGroupClick, onReorderField, sortKey, sortDir, onSortChange }: { processes: Process[]; categoryFilter: string; activeFields: string[]; onGroupClick?: (title: string, subtitle: string, ps: Process[]) => void; onReorderField: ReorderFn; sortKey: string | null; sortDir: 'asc' | 'desc'; onSortChange: (key: string) => void }) {
  const agentMap = useMemo(() => {
    const filt = categoryFilter === 'all' ? processes : processes.filter(p => p.category === categoryFilter);
    const map: Record<string, Process[]> = {};
    filt.forEach(p => { const a = p.aiAgent?.trim() || 'Unassigned'; if (!map[a]) map[a] = []; map[a].push(p); });
    let entries = Object.entries(map);
    if (sortKey) {
      const m = sortDir === 'asc' ? 1 : -1;
      entries = entries.sort(([agentA, psA], [agentB, psB]) => {
        switch (sortKey) {
          case 'count':
          case 'processes':  return (psA.length - psB.length) * m;
          case 'categories': return (new Set(psA.map(p => p.category)).size - new Set(psB.map(p => p.category)).size) * m;
          default:           return agentA.localeCompare(agentB) * m;
        }
      });
    } else {
      entries = entries.sort((a, b) => b[1].length - a[1].length);
    }
    return entries;
  }, [processes, categoryFilter, sortKey, sortDir]);

  const fieldDefs = FIELD_DEFS['ai-agents'].filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-2xl font-bold font-display text-primary">{agentMap.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Unique AI Agents</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-2xl font-bold font-display text-green-400">
            {agentMap.filter(([a]) => a !== 'Unassigned').reduce((s, [, ps]) => s + ps.length, 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Processes with AI Agent</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-2xl font-bold font-display text-amber-400">
            {agentMap.find(([a]) => a === 'Unassigned')?.[1].length ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Unassigned Processes</div>
        </div>
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <DraggableTh key={f.key} fieldKey={f.key} onReorder={onReorderField} isActive={sortKey === f.key} sortDir={sortDir} onSort={() => onSortChange(f.key)}>{f.label}</DraggableTh>)}</tr></thead>
        <tbody>
          {agentMap.map(([agent, ps]) => (
            <tr
              key={agent}
              className="hover:bg-secondary/30 transition-colors cursor-pointer"
              onClick={() => onGroupClick?.(agent, 'AI Agent', ps)}
            >
              {fieldDefs.map(f => <Td key={f.key}>{renderAgentCell(agent, ps, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderKpiCell(p: Process, field: string): React.ReactNode {
  const dash = <span className="text-muted-foreground/50 italic">—</span>;
  switch (field) {
    case 'processId':   return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'processName': return <span className="font-medium">{p.processName}</span>;
    case 'category':    return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'kpi':          return <span className="text-xs">{p.kpi || dash}</span>;
    case 'target':       return <span className="text-xs">{p.target || dash}</span>;
    case 'achievement':  return <span className="text-xs">{p.achievement || dash}</span>;
    case 'trafficLight': return <TrafficLightBadge value={p.trafficLight} />;
    default:             return null;
  }
}

function KpiReport({ processes, activeFields, onRowClick, onReorderField, sortKey, sortDir, onSortChange }: { processes: Process[]; activeFields: string[]; onRowClick?: (p: Process) => void; onReorderField: ReorderFn; sortKey: string | null; sortDir: 'asc' | 'desc'; onSortChange: (key: string) => void }) {
  const withKpi         = processes.filter(p => p.kpi?.trim()).length;
  const withTarget      = processes.filter(p => p.target?.trim()).length;
  const withAchievement = processes.filter(p => p.achievement?.trim()).length;
  const fieldDefs = FIELD_DEFS.kpi.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Have KPI Defined', value: withKpi,         total: processes.length, color: 'text-primary' },
          { label: 'Have Target Set',   value: withTarget,      total: processes.length, color: 'text-blue-400' },
          { label: 'Have Achievement',  value: withAchievement, total: processes.length, color: 'text-green-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>
              {card.value}<span className="text-sm text-muted-foreground font-normal">/{card.total}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
            <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className={cn("h-full rounded-full", card.color.replace('text-', 'bg-'))} style={{ width: `${Math.round((card.value / card.total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <DraggableTh key={f.key} fieldKey={f.key} onReorder={onReorderField} isActive={sortKey === f.key} sortDir={sortDir} onSort={() => onSortChange(f.key)}>{f.label}</DraggableTh>)}</tr></thead>
        <tbody>
          {sortProcesses(processes, sortKey, sortDir).map(p => (
            <tr
              key={p.id}
              className="hover:bg-secondary/30 transition-colors cursor-pointer"
              onClick={() => onRowClick?.(p)}
            >
              {fieldDefs.map(f => <Td key={f.key}>{renderKpiCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderValueCell(p: Process, field: string): React.ReactNode {
  const dash = <span className="text-muted-foreground/50 italic">—</span>;
  switch (field) {
    case 'processId':   return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'processName': return <span className="font-medium">{p.processName}</span>;
    case 'category':    return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'valueImpact': return <span className="text-xs max-w-xs">{p.estimatedValueImpact || dash}</span>;
    case 'benchmark':   return <span className="text-xs max-w-xs">{p.industryBenchmark || dash}</span>;
    default:            return null;
  }
}

function ValueReport({ processes, activeFields, onRowClick, onReorderField, sortKey, sortDir, onSortChange }: { processes: Process[]; activeFields: string[]; onRowClick?: (p: Process) => void; onReorderField: ReorderFn; sortKey: string | null; sortDir: 'asc' | 'desc'; onSortChange: (key: string) => void }) {
  const withValue     = processes.filter(p => p.estimatedValueImpact?.trim()).length;
  const withBenchmark = processes.filter(p => p.industryBenchmark?.trim()).length;
  const fieldDefs = FIELD_DEFS.value.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'With Value Impact', value: withValue,     total: processes.length, color: 'text-primary' },
          { label: 'With Benchmark',    value: withBenchmark, total: processes.length, color: 'text-violet-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>
              {card.value}<span className="text-sm text-muted-foreground font-normal">/{card.total}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <DraggableTh key={f.key} fieldKey={f.key} onReorder={onReorderField} isActive={sortKey === f.key} sortDir={sortDir} onSort={() => onSortChange(f.key)}>{f.label}</DraggableTh>)}</tr></thead>
        <tbody>
          {sortProcesses(processes, sortKey, sortDir).map(p => (
            <tr
              key={p.id}
              className="hover:bg-secondary/30 transition-colors cursor-pointer"
              onClick={() => onRowClick?.(p)}
            >
              {fieldDefs.map(f => <Td key={f.key}>{renderValueCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderPortfolioCell(p: Process, field: string): React.ReactNode {
  const dash = <span className="text-muted-foreground/50 italic">—</span>;
  switch (field) {
    case 'processId':      return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'category':       return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'processName':    return <span className="font-medium">{p.processName}</span>;
    case 'inPortfolio':    return p.included
      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">Yes</span>
      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-semibold">No</span>;
    case 'purpose':        return <span className="text-xs max-w-xs truncate block">{p.purpose || dash}</span>;
    case 'inputs':         return <span className="text-xs max-w-xs truncate block">{p.inputs || dash}</span>;
    case 'outputs':        return <span className="text-xs max-w-xs truncate block">{p.outputs || dash}</span>;
    case 'humanInTheLoop': return <span className="text-xs max-w-xs truncate block">{p.humanInTheLoop || dash}</span>;
    default:               return null;
  }
}

function PortfolioReport({ processes, activeFields, onRowClick, onReorderField, sortKey, sortDir, onSortChange }: { processes: Process[]; activeFields: string[]; onRowClick?: (p: Process) => void; onReorderField: ReorderFn; sortKey: string | null; sortDir: 'asc' | 'desc'; onSortChange: (key: string) => void }) {
  const included = processes.filter(p => p.included).length;
  const fieldDefs = FIELD_DEFS.portfolio.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Processes',     value: processes.length,                color: 'text-primary' },
          { label: 'In Portfolio',        value: included,                        color: 'text-green-400' },
          { label: 'Excluded',            value: processes.length - included,     color: 'text-muted-foreground' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <DraggableTh key={f.key} fieldKey={f.key} onReorder={onReorderField} isActive={sortKey === f.key} sortDir={sortDir} onSort={() => onSortChange(f.key)}>{f.label}</DraggableTh>)}</tr></thead>
        <tbody>
          {sortProcesses(processes, sortKey, sortDir).map(p => (
            <tr
              key={p.id}
              className="hover:bg-secondary/30 transition-colors cursor-pointer"
              onClick={() => onRowClick?.(p)}
            >
              {fieldDefs.map(f => <Td key={f.key}>{renderPortfolioCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}
