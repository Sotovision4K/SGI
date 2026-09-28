import { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Check,
  Clock,
  User,
  FileText,
  Building2,
  MessageSquare,
  Send,
} from 'lucide-react';
import type { Plan, PlanTask, TaskStatus, UpdateTaskInput } from '../../api/plan';
import { useUpdateTask, useTaskComments, useAddTaskComment } from '../../hooks/usePlan';
import { Input } from '../../components/ui/Input';
import { SelectNative } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/Dialog';

const PRIORITY_STYLES: Record<PlanTask['priority'], { bg: string; text: string; label: string; icon: typeof AlertTriangle }> = {
  high: { bg: 'bg-red-100', text: 'text-red-700', label: 'Alta', icon: AlertTriangle },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Media', icon: AlertCircle },
  low: { bg: 'bg-green-100', text: 'text-green-700', label: 'Baja', icon: CheckCircle2 },
};

// Kanban columns, ordered left→right. DB stores the English value; labels are ES.
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'pending', label: 'Pendiente' },
  { status: 'started', label: 'Iniciada' },
  { status: 'completed', label: 'Completada' },
];

// ── Edit draft helpers ──────────────────────────────────────────────────────

interface TaskDraft {
  title: string;
  description: string;
  priority: PlanTask['priority'];
  estimated_effort: string;
  owner_role: string;
  department: string;
  require_document: boolean;
  document_title: string;
  status: TaskStatus;
}

// Normalize a task into an editable draft. Older cached data may lack the new
// fields — default them here at the component layer.
function toDraft(task: PlanTask): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    estimated_effort: task.estimated_effort,
    owner_role: task.owner_role,
    department: task.department ?? '',
    require_document: task.require_document ?? false,
    document_title: task.document_title ?? '',
    status: task.status ?? 'pending',
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
  if (draft.department !== task.department) input.department = draft.department;
  if (draft.status !== task.status) input.status = draft.status;
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Task detail dialog (edit + comments) ────────────────────────────────────

function TaskDetailDialog({
  task,
  processId,
  onClose,
}: {
  task: PlanTask;
  processId: string;
  onClose: () => void;
}) {
  const { mutate: updateTask, isPending } = useUpdateTask(processId);
  const { data: comments = [] } = useTaskComments(processId, task.id);
  const addComment = useAddTaskComment(processId);
  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task));
  const [titleError, setTitleError] = useState('');
  const [commentText, setCommentText] = useState('');

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
      // Nothing changed — close without calling the API
      // (the backend rejects empty updates with a 400)
      onClose();
      return;
    }
    updateTask({ taskId: task.id, input }, { onSuccess: onClose });
  };

  const handleAddComment = () => {
    const body = commentText.trim();
    if (!body) return;
    addComment.mutate({ taskId: task.id, body });
    setCommentText('');
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar tarea</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <label className="block text-sm font-medium text-app-text mb-1.5">Estado</label>
              <SelectNative
                value={draft.status}
                onChange={(e) => setField('status', e.target.value as TaskStatus)}
                aria-label="Estado"
              >
                <option value="pending">Pendiente</option>
                <option value="started">Iniciada</option>
                <option value="completed">Completada</option>
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
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-app-text mb-1.5">Departamento</label>
              <Input
                value={draft.department}
                onChange={(e) => setField('department', e.target.value)}
                placeholder="Departamento responsable (vacío = Por definir)"
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

          {/* Comments */}
          <div className="border-t border-app-border pt-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-app-text mb-3">
              <MessageSquare className="w-4 h-4 text-app-accent" />
              Comentarios
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-sm text-app-muted">Sin comentarios todavía.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="bg-app-bg rounded-lg px-3 py-2">
                    <p className="text-sm text-app-text whitespace-pre-wrap">{c.body}</p>
                    <p className="text-xs text-app-muted mt-1">{formatDate(c.created_at)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Añadir un comentario..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddComment}
                loading={addComment.isPending}
                aria-label="Enviar comentario"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleSave} loading={isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Task card ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onOpen,
  onComplete,
  onDragStart,
  onDragEnd,
}: {
  task: PlanTask;
  onOpen: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
}) {
  const style = PRIORITY_STYLES[task.priority];
  const Icon = style.icon;
  const department = task.department?.trim();

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      className="group border border-app-border rounded-lg bg-white hover:border-app-border-hover hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="w-full text-left p-3"
      >
        <p className="font-medium text-app-text text-sm">{task.title}</p>
        {task.description && (
          <p className="text-xs text-app-muted mt-1 line-clamp-2">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
            <Icon className="w-3 h-3" />
            {style.label}
          </span>
          {department ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-app-accent/10 text-app-accent">
              <Building2 className="w-3 h-3" />
              {department}
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-app-bg text-app-muted">
              Por definir
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-app-muted mt-2">
          {task.owner_role && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {task.owner_role}
            </span>
          )}
          {task.estimated_effort && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {task.estimated_effort}
            </span>
          )}
          {task.require_document && (
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {task.document_title ?? 'Documento requerido'}
            </span>
          )}
        </div>
      </button>
      {task.status !== 'completed' && (
        <div className="px-2 pb-2 flex justify-end">
          <button
            type="button"
            onClick={() => onComplete(task.id)}
            aria-label="Completar tarea"
            title="Completar tarea"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-app-muted hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Completar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Kanban column ───────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  label,
  tasks,
  onOpen,
  onComplete,
  onDragStart,
  onDragEnd,
  onDropTask,
  isDropTarget,
  setDropTarget,
}: {
  status: TaskStatus;
  label: string;
  tasks: PlanTask[];
  onOpen: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onDropTask: (status: TaskStatus) => void;
  isDropTarget: boolean;
  setDropTarget: (status: TaskStatus | null) => void;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-app-text">{label}</h3>
        <span className="text-xs font-semibold text-app-muted bg-app-bg px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropTarget(status);
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropTarget(null);
          onDropTask(status);
        }}
        className={`flex flex-col gap-3 min-h-[200px] rounded-xl p-2 transition-colors ${
          isDropTarget ? 'bg-app-accent/5 ring-2 ring-app-accent/30 ring-inset' : 'bg-app-bg/60'
        }`}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onOpen={onOpen}
            onComplete={onComplete}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex-1 flex items-center justify-center border border-dashed border-app-border rounded-lg py-8 text-xs text-app-muted">
            Sin tareas
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export function PlanResultView({ plan }: { plan: Plan }) {
  const processId = plan.process_id;
  const { mutate: updateTask } = useUpdateTask(processId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  const tasks = (plan.tasks ?? []).map((t) => ({
    ...t,
    // Defensive normalization: an older backend may not return the kanban
    // fields yet, so fall back so tasks still render (all in "Pendiente").
    status: (t.status || 'pending') as TaskStatus,
    department: t.department ?? '',
  }));
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const moveTask = (taskId: string, status: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    updateTask({ taskId, input: { status } });
  };

  const handleDrop = (status: TaskStatus) => {
    if (draggedTaskId) moveTask(draggedTaskId, status);
    setDraggedTaskId(null);
  };

  const byStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-app-text mb-3">
          Plan de acción
          <span className="ml-2 text-sm font-normal text-app-muted">
            ({tasks.length} tareas)
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              tasks={byStatus(col.status)}
              onOpen={setSelectedTaskId}
              onComplete={(taskId) => moveTask(taskId, 'completed')}
              onDragStart={setDraggedTaskId}
              onDragEnd={() => setDraggedTaskId(null)}
              onDropTask={handleDrop}
              isDropTarget={dropTarget === col.status}
              setDropTarget={setDropTarget}
            />
          ))}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          processId={processId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
