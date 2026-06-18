import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, Clock, User, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Plan, PlanTask } from '../../api/plan';

const PRIORITY_STYLES: Record<PlanTask['priority'], { bg: string; text: string; label: string; icon: typeof AlertTriangle }> = {
  high: { bg: 'bg-red-100', text: 'text-red-700', label: 'Alta', icon: AlertTriangle },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Media', icon: AlertCircle },
  low: { bg: 'bg-green-100', text: 'text-green-700', label: 'Baja', icon: CheckCircle2 },
};

function TaskCard({ task, defaultExpanded }: { task: PlanTask; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const style = PRIORITY_STYLES[task.priority];
  const Icon = style.icon;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-soft transition-colors"
      >
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-light text-accent text-xs font-bold flex items-center justify-center">
          {task.sort_order + 1}
        </span>
        <span className="flex-1 font-medium text-text-main">{task.title}</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
          <Icon className="w-3 h-3" />
          {style.label}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-bg-soft space-y-2">
          {task.description && (
            <p className="text-sm text-text-main whitespace-pre-wrap">{task.description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-text-muted pt-2">
            {task.estimated_effort && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {task.estimated_effort}
              </span>
            )}
            {task.owner_role && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" />
                {task.owner_role}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlanResultView({ plan }: { plan: Plan }) {
  const sortedTasks = [...plan.tasks].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-primary mb-3">Resumen ejecutivo</h3>
        <div className="prose prose-sm max-w-none text-text-main bg-bg-soft rounded-lg p-4 border border-border">
          {plan.summary_md ? (
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mb-2 text-primary">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2 text-primary">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1 text-primary">{children}</h3>,
                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              }}
            >
              {plan.summary_md}
            </ReactMarkdown>
          ) : (
            <p className="text-text-muted italic">El LLM no generó un resumen.</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-primary mb-3">
          Plan de acción
          <span className="ml-2 text-sm font-normal text-text-muted">
            ({sortedTasks.length} tareas)
          </span>
        </h3>
        <div className="space-y-2">
          {sortedTasks.map((task, idx) => (
            <TaskCard key={task.id} task={task} defaultExpanded={idx < 3} />
          ))}
        </div>
      </div>
    </div>
  );
}
