import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useCompanies } from '../../hooks/useCompanies';
import { useQuestionnaire } from '../../hooks/useQuestionnaire';
import { useStartProcess } from '../../hooks/useStartProcess';
import { createCompany } from '../../api/company';
import { saveFindings, generatePlan } from '../../api/plan';
import { useApiAuthBridge } from '../../lib/use-api-auth';
import { PlanResultView } from './PlanResultView';
import type { Plan } from '../../api/plan';
import type { Question } from '../../api/questionnaire';

const ISO_OPTIONS: { value: 'iso9001' | 'iso14001' | 'iso45001'; label: string; description: string }[] = [
  { value: 'iso9001', label: 'ISO 9001:2015', description: 'Sistema de Gestión de la Calidad' },
  { value: 'iso14001', label: 'ISO 14001:2015', description: 'Sistema de Gestión Ambiental' },
  { value: 'iso45001', label: 'ISO 45001:2018', description: 'Seguridad y Salud en el Trabajo' },
];

type Phase = 'setup' | 'findings' | 'generating' | 'plan';

export function StartProcessModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { getToken } = useApiAuthBridge();
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const startProcess = useStartProcess();

  const [phase, setPhase] = useState<Phase>('setup');
  const [companyId, setCompanyId] = useState('');
  const [isoStandard, setIsoStandard] = useState<'iso9001' | 'iso14001' | 'iso45001' | null>(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyType, setNewCompanyType] = useState('general');
  const [creatingCompany, setCreatingCompany] = useState(false);

  const [processId, setProcessId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: questionnaire, isLoading: questionnaireLoading } = useQuestionnaire(isoStandard);

  const canStart = companyId && isoStandard;

  const totalQuestions = useMemo(
    () => questionnaire?.groups.reduce((acc, g) => acc + g.questions.length, 0) ?? 0,
    [questionnaire],
  );

  const requiredQuestions = useMemo(
    () =>
      questionnaire?.groups.flatMap((g) => g.questions.filter((q) => q.required)) ?? [],
    [questionnaire],
  );

  const allRequiredAnswered = useMemo(
    () => requiredQuestions.every((q) => (answers[q.id] ?? '').trim().length > 0),
    [requiredQuestions, answers],
  );

  useEffect(() => {
    if (phase !== 'plan') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  async function handleCreateCompany() {
    if (!newCompanyName.trim()) return;
    setCreatingCompany(true);
    setError(null);
    try {
      const company = await createCompany(
        { name: newCompanyName.trim(), business_type: newCompanyType },
        { token: getToken() },
      );
      setCompanyId(company.company_id);
      setShowCreateCompany(false);
      setNewCompanyName('');
      setNewCompanyType('general');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la empresa');
    } finally {
      setCreatingCompany(false);
    }
  }

  async function handleStart() {
    if (!canStart) return;
    setError(null);
    try {
      const process = await startProcess.mutateAsync({
        company_id: companyId,
        iso_standard: isoStandard!,
      });
      setProcessId(process.id);
      setPhase('findings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el proceso');
    }
  }

  async function handleGenerate() {
    if (!processId) return;
    setError(null);
    setPhase('generating');
    try {
      const token = getToken();
      await saveFindings(processId, { answers, free_text: freeText }, { token });
      const result = await generatePlan(processId, { token });
      setPlan(result);
      setPhase('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar el plan');
      setPhase('findings');
    }
  }

  function handleClose() {
    if (phase === 'generating') return;
    onClose();
  }

  function handleViewProcess() {
    if (processId) {
      onClose();
      navigate(`/processes/${processId}`);
    }
  }

  function renderQuestion(q: Question) {
    const value = answers[q.id] ?? '';
    const onChange = (v: string) => setAnswers((prev) => ({ ...prev, [q.id]: v }));

    if (q.type === 'select') {
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        >
          <option value="">Seleccione...</option>
          {q.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (q.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-y"
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.placeholder}
        className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-primary">Nuevo Proceso de Certificación</h2>
            <p className="text-sm text-text-muted">
              {phase === 'setup' && 'Paso 1: Configuración inicial'}
              {phase === 'findings' && `Paso 2: Diagnóstico (${totalQuestions} preguntas)`}
              {phase === 'generating' && 'Generando plan de acción con IA...'}
              {phase === 'plan' && 'Plan generado'}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={phase === 'generating'}
            className="p-2 text-text-muted hover:text-text-main disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {phase === 'setup' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-text-main mb-2">
                  Empresa
                </label>
                {companiesLoading ? (
                  <div className="text-text-muted text-sm">Cargando empresas...</div>
                ) : companies.length === 0 && !showCreateCompany ? (
                  <div className="text-text-muted text-sm">
                    No hay empresas registradas. Crea una nueva para continuar.
                  </div>
                ) : (
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    disabled={showCreateCompany}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent disabled:bg-bg-soft"
                  >
                    <option value="">Seleccione una empresa...</option>
                    {companies.map((c) => (
                      <option key={c.company_id} value={c.company_id}>
                        {c.name || '(sin nombre)'} - {c.business_type}
                      </option>
                    ))}
                  </select>
                )}

                {!showCreateCompany ? (
                  <button
                    onClick={() => setShowCreateCompany(true)}
                    className="mt-2 text-sm text-accent hover:underline"
                  >
                    + Crear nueva empresa
                  </button>
                ) : (
                  <div className="mt-3 p-4 border border-border rounded-lg bg-bg-soft space-y-3">
                    <input
                      type="text"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Nombre de la empresa"
                      className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main"
                    />
                    <select
                      value={newCompanyType}
                      onChange={(e) => setNewCompanyType(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main"
                    >
                      <option value="general">General</option>
                      <option value="manufactura">Manufactura</option>
                      <option value="servicios">Servicios</option>
                      <option value="tecnologia">Tecnología</option>
                      <option value="construccion">Construcción</option>
                      <option value="alimentos">Alimentos</option>
                      <option value="salud">Salud</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateCompany}
                        disabled={!newCompanyName.trim() || creatingCompany}
                        className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                      >
                        {creatingCompany ? 'Creando...' : 'Crear'}
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateCompany(false);
                          setNewCompanyName('');
                        }}
                        className="px-4 py-2 border border-border rounded-lg text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-text-main mb-2">
                  Norma ISO
                </label>
                <div className="space-y-2">
                  {ISO_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                        isoStandard === opt.value
                          ? 'border-accent bg-accent-light'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="iso"
                        value={opt.value}
                        checked={isoStandard === opt.value}
                        onChange={() => setIsoStandard(opt.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-text-main">{opt.label}</div>
                        <div className="text-sm text-text-muted">{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {phase === 'findings' && (
            <div className="space-y-6">
              {questionnaireLoading || !questionnaire ? (
                <div className="text-text-muted text-sm">Cargando diagnóstico...</div>
              ) : (
                <>
                  {questionnaire.groups.map((group) => (
                    <div key={group.id}>
                      <div className="flex items-baseline gap-2 mb-3">
                        <h3 className="text-lg font-semibold text-primary">{group.title}</h3>
                        <span className="text-xs text-text-muted">
                          {group.clauses.join(', ')}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {group.questions.map((q) => (
                          <div key={q.id}>
                            <label className="block text-sm font-medium text-text-main mb-1">
                              {q.label}
                              {q.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            {renderQuestion(q)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="pt-4 border-t border-border">
                    <label className="block text-sm font-semibold text-text-main mb-2">
                      Notas libres
                    </label>
                    <p className="text-xs text-text-muted mb-2">
                      Cualquier información adicional que ayude a generar un mejor plan
                      (contexto, restricciones, prioridades del negocio, etc.).
                    </p>
                    <textarea
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      rows={5}
                      maxLength={10000}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-y"
                      placeholder="Contexto adicional sobre la empresa, sector, mercado, etc."
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
              <h3 className="text-lg font-semibold text-primary mb-2">
                Generando plan de acción
              </h3>
              <p className="text-text-muted text-sm max-w-md">
                Analizando el diagnóstico y generando un plan personalizado. Esto puede tardar
                entre 10 y 30 segundos.
              </p>
            </div>
          )}

          {phase === 'plan' && plan && (
            <PlanResultView plan={plan} />
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-bg-soft">
          {phase === 'setup' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleStart}
                disabled={!canStart || startProcess.isPending}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
              >
                {startProcess.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Continuar
              </button>
            </>
          )}
          {phase === 'findings' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                disabled={!allRequiredAnswered || saveFindings.isPending || generatePlan.isPending}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Generar Plan
              </button>
            </>
          )}
          {phase === 'plan' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-white"
              >
                Cerrar
              </button>
              <button
                onClick={handleViewProcess}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90"
              >
                Ver proceso
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
