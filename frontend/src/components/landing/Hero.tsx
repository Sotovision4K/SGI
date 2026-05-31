import { ArrowRight } from 'lucide-react';

interface HeroProps {
  onOpenModal: () => void;
}

export function Hero({ onOpenModal }: HeroProps) {
  return (
    <section className="py-24 md:py-20 bg-gradient-to-b from-bg-soft to-white">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid md:grid-cols-[1.1fr_1fr] gap-16 items-center">
          {/* Left Content */}
          <div>
            <div className="inline-flex items-center gap-1.5 bg-accent-light text-accent px-3.5 py-1.5 rounded-full text-sm font-semibold mb-5">
              <span className="w-2 h-2 bg-accent rounded-full"></span>
              Certificación ISO acelerada
            </div>
            <h1 className="text-5xl md:text-[52px] font-extrabold text-primary leading-tight tracking-tight mb-5">
              Automatiza tu <span className="text-accent">Sistema Integrado de Gestión</span> con precisión
            </h1>
            <p className="text-lg text-text-muted mb-8 max-w-[520px]">
              Implementa y mantén sistemas de gestión bajo las normas ISO 9001, ISO 14001 e ISO 45001 de forma guiada, rápida y confiable. Diseñado para empresas y consultores.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={onOpenModal}
                className="bg-accent text-white px-8 py-4 rounded-lg text-base font-semibold hover:bg-[#0052A3] hover:-translate-y-0.5 hover:shadow-md transition-all flex items-center gap-2"
              >
                Get Started <ArrowRight size={18} />
              </button>
              <a
                href="#features"
                className="bg-transparent text-primary px-8 py-4 rounded-lg text-base font-semibold border border-border hover:border-accent hover:text-accent transition-all"
              >
                Ver cómo funciona
              </a>
            </div>
          </div>

          {/* Right Visual */}
          <div className="bg-white border border-border rounded-xl p-6 shadow-md">
            <div className="flex gap-1.5 mb-5 pb-4 border-b border-border">
              <span className="w-2.5 h-2.5 rounded-full bg-border"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-border"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-border"></span>
            </div>

            {/* Progress Items */}
            <div className="space-y-3">
              <ProgressItem code="9K" label="ISO 9001 — Calidad" progress={85} />
              <ProgressItem code="14K" label="ISO 14001 — Ambiental" progress={62} />
              <ProgressItem code="45K" label="ISO 45001 — SST" progress={48} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface ProgressItemProps {
  code: string;
  label: string;
  progress: number;
}

function ProgressItem({ code, label, progress }: ProgressItemProps) {
  return (
    <div className="flex items-center gap-3 p-3.5 bg-bg-soft rounded-lg">
      <div className="w-9 h-9 bg-accent-light text-accent rounded-md flex items-center justify-center font-bold text-sm flex-shrink-0">
        {code}
      </div>
      <div className="flex-1">
        <strong className="block text-sm text-primary mb-1">{label}</strong>
        <div className="h-1 bg-border rounded overflow-hidden">
          <div
            className="h-full bg-accent rounded transition-all duration-1000"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}