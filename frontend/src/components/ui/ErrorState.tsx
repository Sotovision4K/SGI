import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function ErrorState({ title, message, action }: ErrorStateProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-lg border border-red-200 p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-text-main mb-2">{title}</h2>
        <p className="text-sm text-text-muted mb-4">{message}</p>
        {action && (
          <Button variant="outline" onClick={action.onClick} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
