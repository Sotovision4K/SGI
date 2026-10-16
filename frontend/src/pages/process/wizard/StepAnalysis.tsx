import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { analyzeProcessProfiling, type ProfilingResult } from '../../../api/profiling';
import { saveAnalysis } from '../../../api/process';
import { ProfilingResults } from '../../profiling/ProfilingResults';
import { useApiAuthBridge } from '../../../lib/use-api-auth';
import { toast } from '../../../components/ui/toast';
import { getErrorMessage } from '../../../lib/error-utils';

interface StepAnalysisProps {
  processId: string;
  onDone: () => void;
}

export function StepAnalysis({ processId, onDone }: StepAnalysisProps) {
  const { getToken } = useApiAuthBridge();
  const [result, setResult] = useState<ProfilingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await analyzeProcessProfiling(processId, { token: getToken() });
        if (!cancelled) setResult(res);
      } catch (err) {
        if (!cancelled) {
          const message = getErrorMessage(err);
          setError(message);
          toast.danger(message, { title: 'Error al generar análisis' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId, retryToken]);

  async function handleConfirm() {
    if (!result) return;
    setConfirming(true);
    try {
      await saveAnalysis(processId, result, { token: getToken() });
      onDone();
    } catch (err) {
      toast.danger(getErrorMessage(err), { title: 'Error al guardar análisis' });
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="w-12 h-12 text-app-accent animate-spin mb-4" />
        <h3 className="text-lg font-semibold text-app-text mb-2">Generando análisis...</h3>
        <p className="text-app-muted text-sm max-w-md">
          Analizando el perfilamiento con el motor LLM. Esto puede tardar unos segundos.
        </p>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-app-text mb-2">No se pudo generar el análisis</h3>
        <p className="text-app-muted text-sm mb-4">{error}</p>
        <button
          type="button"
          onClick={() => setRetryToken((t) => t + 1)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {result && <ProfilingResults result={result} onBack={() => setRetryToken((t) => t + 1)} />}
      </div>

      <div className="shrink-0 pt-4 border-t border-app-border flex justify-end">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || !result}
          className="px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Confirmar
        </button>
      </div>
    </div>
  );
}
