import { useEffect, useRef, useState } from 'react';

interface StatsProps {
  onOpenModal: () => void;
}

// Animation constants
const ANIMATION_STEPS = 40;
const ANIMATION_INTERVAL_MS = 25;
const INTERSECTION_THRESHOLD = 0.5;

// Stats display constants
const STAT_DISPLAY_SIZE = '44px';

const statsData = [
  { target: 70, suffix: '%', label: 'Menos tiempo de implementación' },
  { target: 90, suffix: '%', label: 'Reducción de documentación manual' },
  { target: 3, suffix: 'x', label: 'Más rápido que procesos tradicionales' },
  { target: 100, suffix: '%', label: 'Trazabilidad garantizada' },
];

export function Stats({ onOpenModal }: StatsProps) {
  return (
    <section className="py-20 bg-gradient-to-br from-primary to-[#0F2B4F] text-white text-center">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-4xl md:text-[38px] font-bold tracking-tight mb-4">
          Avanza hasta 3x más rápido
        </h2>
        <p className="text-[17px] opacity-85 max-w-[600px] mx-auto mb-12">
          La automatización reduce drásticamente el tiempo de implementación y mantenimiento, sin sacrificar calidad ni cumplimiento.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {statsData.map((stat) => (
            <StatItem key={stat.label} {...stat} />
          ))}
        </div>

        <button
          onClick={onOpenModal}
          className="bg-white text-primary px-8 py-4 rounded-lg text-base font-semibold hover:bg-[#E8F1FB] transition-all"
        >
          Comenzar ahora →
        </button>
      </div>
    </section>
  );
}

interface StatItemProps {
  target: number;
  suffix: string;
  label: string;
}

function StatItem({ target, suffix, label }: StatItemProps) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setHasAnimated(true);
            let current = 0;
            const step = target / ANIMATION_STEPS;
            const interval = setInterval(() => {
              current += step;
              if (current >= target) {
                current = target;
                clearInterval(interval);
              }
              setCount(Math.round(current));
            }, ANIMATION_INTERVAL_MS);
          }
        });
      },
      { threshold: INTERSECTION_THRESHOLD }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return (
    <div ref={ref} className="p-6">
      <div className={`text-5xl md:text-[${STAT_DISPLAY_SIZE}] font-extrabold text-green-400 tracking-tight mb-2`}>
        {count}{suffix}
      </div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}