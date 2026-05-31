import { ClipboardList, FileText, Settings, Search, BarChart3, RefreshCw } from 'lucide-react';

const features = [
  {
    icon: ClipboardList,
    title: 'Diagnóstico automatizado',
    description: 'Evaluación inicial del estado de tu empresa frente a los requisitos de la norma ISO seleccionada.',
  },
  {
    icon: FileText,
    title: 'Documentación inteligente',
    description: 'Generación asistida de manuales, procedimientos, políticas y registros obligatorios.',
  },
  {
    icon: Settings,
    title: 'Implementación guiada',
    description: 'Flujo paso a paso con tareas, responsables y cronograma para certificarte sin complicaciones.',
  },
  {
    icon: Search,
    title: 'Auditorías internas',
    description: 'Planifica, ejecuta y registra auditorías con listas de verificación preconfiguradas.',
  },
  {
    icon: BarChart3,
    title: 'Indicadores y KPIs',
    description: 'Dashboards en tiempo real para medir el desempeño de tu SGI y tomar decisiones informadas.',
  },
  {
    icon: RefreshCw,
    title: 'Mantenimiento continuo',
    description: 'Alertas automáticas, seguimiento a hallazgos y gestión de la mejora continua.',
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 bg-bg-soft">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center max-w-[680px] mx-auto mb-14">
          <div className="text-accent text-xs font-bold uppercase tracking-[1.2px] mb-3">
            Qué puedes hacer
          </div>
          <h2 className="text-4xl md:text-[38px] font-bold text-primary leading-tight tracking-tight mb-4">
            Todo tu sistema de gestión en un solo lugar
          </h2>
          <p className="text-[17px] text-text-muted">
            Desde el diagnóstico inicial hasta las auditorías internas y el mantenimiento continuo del sistema.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface FeatureCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-white p-8 rounded-xl border border-border hover:-translate-y-1 hover:shadow-md hover:border-accent transition-all">
      <div className="w-11 h-11 bg-accent-light text-accent rounded-lg flex items-center justify-center mb-5">
        <Icon size={20} />
      </div>
      <h3 className="text-lg font-semibold text-primary mb-2.5">{title}</h3>
      <p className="text-[15px] text-text-muted">{description}</p>
    </div>
  );
}