import { Building2, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RoleModal({ isOpen, onClose }: RoleModalProps) {
  const navigate = useNavigate();
  if (!isOpen) return null;

  const handleSelectRole = (event: React.MouseEvent<HTMLButtonElement>, role: string) => {
    event.preventDefault();
    navigate(`/auth/signup?role=${role}`);
    onClose();
  };

  const handleCompanySelect = (e: React.MouseEvent<HTMLButtonElement>) => handleSelectRole(e, 'company');
  const handleConsultantSelect = (e: React.MouseEvent<HTMLButtonElement>) => handleSelectRole(e, 'consultant');

  return (
    <div
      className="fixed inset-0 bg-primary/60 backdrop-blur-sm flex items-center justify-center z-[200] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl p-10 max-w-[480px] w-full animate-slideUp">
        <h3 className="text-2xl font-bold text-primary mb-2">Bienvenido a SGI Pro</h3>
        <p className="text-text-muted mb-6">Selecciona tu rol para personalizar tu experiencia:</p>
        
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            onClick={handleCompanySelect}
            className="p-5 border-2 border-border rounded-lg hover:border-accent hover:bg-accent-light transition-all text-center"
          >
            <div className="text-3xl mb-2">
              <Building2 size={28} className="mx-auto text-primary" />
            </div>
            <strong className="block text-[15px] text-primary mb-1">Soy una Empresa</strong>
            <span className="text-xs text-text-muted">Quiero certificarme</span>
          </button>
          
          <button
            onClick={handleConsultantSelect}
            className="p-5 border-2 border-border rounded-lg hover:border-accent hover:bg-accent-light transition-all text-center"
          >
            <div className="text-3xl mb-2">
              <UserCircle size={28} className="mx-auto text-primary" />
            </div>
            <strong className="block text-[15px] text-primary mb-1">Soy Consultor</strong>
            <span className="text-xs text-text-muted">Asesoro empresas</span>
          </button>
        </div>
        
        <button
          onClick={onClose}
          className="w-full py-2.5 text-text-muted text-sm bg-transparent hover:bg-bg-soft rounded transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}