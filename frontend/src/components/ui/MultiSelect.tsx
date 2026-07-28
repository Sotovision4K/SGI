import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function MultiSelect({ label, options, selected, onChange, className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = options.length > 0 && selected.length === options.length;
  const noneSelected = selected.length === 0;
  const displayText = noneSelected ? `Todas ${label}` : `${selected.length} seleccionados`;

  function toggleOption(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(next);
  }

  function toggleAll() {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors w-full',
          open
            ? 'border-accent ring-1 ring-accent/20'
            : 'border-app-border hover:border-app-border-hover',
          'bg-white text-app-text',
        )}
      >
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn('w-4 h-4 text-app-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-app-border rounded-xl shadow-lg z-50 p-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F1F5F9] cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
              onChange={toggleAll}
              className="rounded border-app-border text-accent focus:ring-accent/30"
            />
            <span className="font-medium text-app-text">Todas</span>
          </label>
          <div className="h-px bg-app-border my-1" />
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F1F5F9] cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggleOption(option.value)}
                className="rounded border-app-border text-accent focus:ring-accent/30"
              />
              <span className="text-app-text">{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
