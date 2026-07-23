import { useState } from 'react';
import { Plus } from 'lucide-react';

interface ObjectiveChipsProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Parse the comma-separated value into a list of selections. */
function parseSelection(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function ObjectiveChips({ options, value, onChange }: ObjectiveChipsProps) {
  const [custom, setCustom] = useState('');

  const selected: string[] = parseSelection(value);

  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((o) => o !== option).join(','));
    } else {
      onChange([...selected, option].join(','));
    }
  }

  function addCustom() {
    const trimmed = custom.trim();
    if (trimmed.length === 0) return;
    if (selected.includes(trimmed)) {
      setCustom('');
      return;
    }
    onChange([...selected, trimmed].join(','));
    setCustom('');
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              type="button"
              key={option}
              onClick={() => toggle(option)}
              aria-label={option}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-app-primary text-white'
                  : 'bg-app-bg text-app-text hover:bg-app-border'
              }`}
            >
              {option}
            </button>
          );
        })}
        {/* Render any custom selections that are not part of the base options */}
        {selected
          .filter((opt) => !options.includes(opt))
          .map((option) => (
            <button
              type="button"
              key={`custom-${option}`}
              onClick={() => toggle(option)}
              aria-label={option}
              className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer bg-app-primary text-white"
            >
              {option}
            </button>
          ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Otro objetivo (opcional)"
          className="flex-1 px-3 py-2 border border-app-border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent"
        />
        <button
          type="button"
          onClick={addCustom}
          aria-label="+"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-app-accent text-white hover:bg-app-accent/90 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}