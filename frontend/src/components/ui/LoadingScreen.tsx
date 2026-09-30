interface LoadingScreenProps {
  label?: string;
}

/**
 * Full-screen spinner used by auth-related routes (sign-in, sign-up, logout)
 * and the ProtectedRoute session check. Centralizes the spinner markup so the
 * loading state stays consistent across the app.
 */
export function LoadingScreen({ label = 'Cargando...' }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-bg-soft flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-text-muted">{label}</p>
      </div>
    </div>
  );
}
