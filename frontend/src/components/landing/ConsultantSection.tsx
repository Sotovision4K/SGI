import { Check } from 'lucide-react';

interface ConsultantSectionProps {
  onOpenModal: () => void;
}

// Consultant profile configuration
const CONSULTANT_PROFILE = {
  name: 'Juan Consultor',
  role: 'Consultor Senior en Sistemas de Gestión',
  initials: 'JC',
  credentials: [
    'Auditor Líder IRCA ISO 9001',
    'Certificación ISO 14001 Lead Implementer',
    'Auditor ISO 45001 – SST',
    '+10 años en implementación de SGI',
    '+50 empresas certificadas con éxito',
  ],
} as const;

export function ConsultantSection({ onOpenModal }: ConsultantSectionProps) {
  return (
    <section id="consultant" className="py-20">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-16 items-center">
          {/* Consultant Card */}
          <div className="bg-gradient-to-br from-primary to-[#1A3A5C] text-white p-10 rounded-2xl relative overflow-hidden">
            {/* Decorative gradient */}
            <div className="absolute -top-1/2 -right-1/2 w-[300px] h-[300px] bg-radial-gradient from-accent/30 to-transparent"></div>
            
            <div className="relative">
              <div className="w-20 h-20 bg-accent rounded-full flex items-center justify-center text-3xl font-bold mb-5">
                {CONSULTANT_PROFILE.initials}
              </div>
              <h3 className="text-2xl font-bold mb-1.5">{CONSULTANT_PROFILE.name}</h3>
              <div className="text-sm opacity-80 mb-5">{CONSULTANT_PROFILE.role}</div>
              
              <ul className="space-y-2.5">
                {CONSULTANT_PROFILE.credentials.map((credential) => (
                  <li key={credential} className="flex items-center gap-2.5 text-sm pt-2.5 border-t border-white/10">
                    <Check size={16} className="text-green-400 font-bold flex-shrink-0" />
                    {credential}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Text Content */}
          <div>
            <div className="text-accent text-xs font-bold uppercase tracking-[1.2px] mb-3">
              El consultor detrás de la herramienta
            </div>
            <h2 className="text-4xl md:text-[36px] font-bold text-primary leading-tight tracking-tight mb-5">
              Experiencia certificada y alcance integral
            </h2>
            <p className="text-base text-text-muted mb-4">
              Nuestro consultor acompaña a empresas de todos los sectores en el camino hacia la certificación, combinando metodología probada con la potencia de la automatización.
            </p>
            <ul className="space-y-2 my-6">
              {[
                'Asesoría personalizada en ISO 9001, 14001 y 45001',
                'Acompañamiento durante auditorías de certificación',
                'Capacitación a equipos internos',
                'Soporte en mantenimiento del sistema post-certificación',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[15px] text-text-main">
                  <span className="text-accent font-bold">→</span>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={onOpenModal}
              className="bg-accent text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#0052A3] transition-all flex items-center gap-2 mt-4"
            >
              Agendar con el consultor →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}