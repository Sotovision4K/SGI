import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  FileText,
  Pencil,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { Plan, PlanTask, UpdateTaskInput } from '../../api/plan';
import type { ComponentProps } from 'react';
import { useUpdateTask } from '../../hooks/usePlan';
import { Input } from '../../components/ui/Input';
import { SelectNative } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

function isSafeUrl(href: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function SafeLink({ href, children }: ComponentProps<'a'>) {
  if (href && !isSafeUrl(href)) {
    return <span className="text-app-muted line-through">{children}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-app-accent underline hover:opacity-80"
    >
      {children}
    </a>
  );
}

const PRIORITY_STYLES: Record<PlanTask['priority'], { bg: string; text: string; label: string; icon: typeof AlertTriangle }> = {
  high: { bg: 'bg-red-100', text: 'text-red-700', label: 'Alta', icon: AlertTriangle },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Media', icon: AlertCircle },
  low: { bg: 'bg-green-100', text: 'text-green-700', label: 'Baja', icon: CheckCircle2 },
};

// ── Inline edit helpers ─────────────────────────────────────────────────────

interface TaskDraft {
  title: string;
  description: string;
  priority: PlanTask['priority'];
  estimated_effort: string;
  owner_role: string;
  require_document: boolean;
  document_title: string;
}

// Normalize a task into an editable draft. Older cached data may lack the
// document fields — default them here at the component layer.
function toDraft(task: PlanTask): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    estimated_effort: task.estimated_effort,
    owner_role: task.owner_role,
    require_document: task.require_document ?? false,
    document_title: task.document_title ?? '',
  };
}

// Build a partial update payload with only the fields that changed.
// When require_document is toggled off, document_title: null is sent to clear it.
function buildUpdateInput(task: PlanTask, draft: TaskDraft): UpdateTaskInput {
  const input: UpdateTaskInput = {};
  if (draft.title !== task.title) input.title = draft.title;
  if (draft.description !== task.description) input.description = draft.description;
  if (draft.priority !== task.priority) input.priority = draft.priority;
  if (draft.estimated_effort !== task.estimated_effort) input.estimated_effort = draft.estimated_effort;
  if (draft.owner_role !== task.owner_role) input.owner_role = draft.owner_role;
  if (draft.require_document !== task.require_document) input.require_document = draft.require_document;
  if (draft.require_document) {
    if (draft.document_title !== (task.document_title ?? '')) {
      input.document_title = draft.document_title.trim() ? draft.document_title : null;
    }
  } else if (task.require_document) {
    // Toggled off — clear any existing document title
    input.document_title = null;
  }
  return input;
}

function TaskEditForm({
  task,
  processId,
  onDone,
}: {
  task: PlanTask;
  processId: string;
  onDone: () => void;
}) {
  const { mutate, isPending } = useUpdateTask(processId);
  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task));
  const [titleError, setTitleError] = useState('');

  const setField = <K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const handleSave = () => {
    if (!draft.title.trim()) {
      setTitleError('El título es obligatorio');
      return;
    }
    setTitleError('');
    const input = buildUpdateInput(task, draft);
    if (Object.keys(input).length === 0) {
      // Nothing changed — exit edit mode without calling the API
      // (the backend rejects empty updates with a 400)
      onDone();
      return;
    }
    mutate({ taskId: task.id, input }, { onSuccess: onDone });
  };

  return (
    <form
      className="p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      noValidate
    >
      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">Título</label>
        <Input
          value={draft.title}
          onChange={(e) => setField('title', e.target.value)}
          placeholder="Título de la tarea"
          error={titleError}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">Descripción</label>
        <textarea
          value={draft.description}
          onChange={(e) => setField('description', e.target.value)}
          rows={3}
          placeholder="Descripción de la tarea"
          className="w-full px-3 py-2 border border-app-border rounded-lg bg-white text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent resize-y"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-app-text mb-1.5">Prioridad</label>
          <SelectNative
            value={draft.priority}
            onChange={(e) => setField('priority', e.target.value as PlanTask['priority'])}
            aria-label="Prioridad"
          >
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </SelectNative>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-text mb-1.5">Esfuerzo estimado</label>
          <Input
            value={draft.estimated_effort}
            onChange={(e) => setField('estimated_effort', e.target.value)}
            placeholder="p. ej. 4 horas"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-text mb-1.5">Rol responsable</label>
          <Input
            value={draft.owner_role}
            onChange={(e) => setField('owner_role', e.target.value)}
            placeholder="p. ej. Responsable de calidad"
          />
        </div>
      </div>
      <div>
        <label className="inline-flex items-center gap-2 text-sm text-app-text cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.require_document}
            onChange={(e) => setField('require_document', e.target.checked)}
            className="w-4 h-4 accent-app-accent"
          />
          Requiere documento
        </label>
      </div>
      {draft.require_document && (
        <div>
          <label className="block text-sm font-medium text-app-text mb-1.5">
            Título del documento
          </label>
          <Input
            value={draft.document_title}
            onChange={(e) => setField('document_title', e.target.value)}
            placeholder="p. ej. Procedimiento de control de documentos"
          />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

// ── Task card ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  defaultExpanded,
  processId,
  isEditing,
  onEditStart,
  onEditEnd,
}: {
  task: PlanTask;
  defaultExpanded: boolean;
  processId: string;
  isEditing: boolean;
  onEditStart: (taskId: string) => void;
  onEditEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const style = PRIORITY_STYLES[task.priority];
  const Icon = style.icon;

  if (isEditing) {
    return (
      <div className="border border-app-accent rounded-lg overflow-hidden bg-white">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-app-bg">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-app-accent/10 text-app-accent text-xs font-bold flex items-center justify-center">
            {task.sort_order + 1}
          </span>
          <span className="flex-1 font-medium text-app-text">Editar tarea</span>
        </div>
        <TaskEditForm task={task} processId={processId} onDone={onEditEnd} />
      </div>
    );
  }

  return (
    <div className="border border-app-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 hover:bg-app-bg transition-colors">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-3 text-left min-w-0"
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-app-accent/10 text-app-accent text-xs font-bold flex items-center justify-center">
            {task.sort_order + 1}
          </span>
          <span className="flex-1 font-medium text-app-text">{task.title}</span>
          <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
            <Icon className="w-3 h-3" />
            {style.label}
          </span>
          {expanded ? (
            <ChevronUp className="flex-shrink-0 w-4 h-4 text-app-muted" />
          ) : (
            <ChevronDown className="flex-shrink-0 w-4 h-4 text-app-muted" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onEditStart(task.id)}
          aria-label="Editar tarea"
          title="Editar tarea"
          className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-app-muted hover:text-app-accent hover:bg-app-accent/10 transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-app-border bg-app-bg space-y-2">
          {task.description && (
            <p className="text-sm text-app-text whitespace-pre-wrap">{task.description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-app-muted pt-2">
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
            {task.require_document && (
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {task.document_title ?? 'Documento requerido'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlanResultView({ plan }: { plan: Plan }) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const sortedTasks = [...plan.tasks].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-app-text mb-3">Resumen ejecutivo</h3>
        <div className="prose prose-sm max-w-none text-app-text bg-app-bg rounded-lg p-4 border border-app-border">
          {plan.summary_md ? (
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mb-2 text-app-text">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2 text-app-text">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1 text-app-text">{children}</h3>,
                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                a: SafeLink,
              }}
            >
              {plan.summary_md}
            </ReactMarkdown>
          ) : (
            <p className="text-app-muted italic">El LLM no generó un resumen.</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-app-text mb-3">
          Plan de acción
          <span className="ml-2 text-sm font-normal text-app-muted">
            ({sortedTasks.length} tareas)
          </span>
        </h3>
        <div className="space-y-2">
          {sortedTasks.map((task, idx) => (
            <TaskCard
              key={task.id}
              task={task}
              defaultExpanded={idx < 3}
              processId={plan.process_id}
              isEditing={editingTaskId === task.id}
              onEditStart={setEditingTaskId}
              onEditEnd={() => setEditingTaskId(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
