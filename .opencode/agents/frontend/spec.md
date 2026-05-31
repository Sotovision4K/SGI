# 1. Cognito Authentication

- Use AWS SDK for Cognito integration
- Implement auth context using ContextApi for global auth state
- Use React hooks for login/signup/logout flows
- Protect routes with auth guards
- use .env variable
- set up a cognito client. 
- the sign in and sign up form must contain the same color pallet
- let a space open for a logo. on each form card, we still dont have a logo.
- it must ask email if the user is already register, else it must redirect to the sign up page.
- the signInForm.tsx must also contain the same color pallete as the whole project.
- Create a confirmEmail.tsx file that awaits for cognito confirmation email. use confirmSignupCommand to confirm the code. redirect to the dashboard page if successfull. leave it blank, that is another spec.
- use signup command function for the sign up page. 
```typescript
// authProvider.tsx
import { AuthProvider } from "react-oidc-context";

const cognitoAuthConfig = {
  authority: `https://cognito-idp.${import.meta.env.VITE_AWS_REGION}.amazonaws.com/${import.meta.env.VITE_USER_POOL_ID}`,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_REDIRECT_URI,
  response_type: "code",
  scope: "email openid phone",
};

export function App() {
  return (
    <AuthProvider {...cognitoAuthConfig}>
      <BrowserRouter>
        <Routes>
          <Route path="/signup"    element={<SignUpPage />} />
          <Route path="/home" element={<Dashboard />} />
          {/* No más /callback — la librería lo maneja sola */}
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

```typescript
  import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate, useLocation } from 'react-router';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';
import { useProfile } from '@/hooks/useProfile';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const auth = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { profile, isLoading: profileLoading } = useProfile();

    // All hooks must be declared before any conditional returns
    useEffect(() => {
        if (!auth.isAuthenticated || !profile) return;

        const onDashboard = location.pathname.startsWith('/dashboard');
        const onOnboarding = location.pathname.startsWith('/onboarding');

        if (!profile.onboardingComplete && onDashboard) {
            navigate('/onboarding', { replace: true });
        } else if (profile.onboardingComplete && onOnboarding) {
            navigate('/dashboard', { replace: true });
        }
    }, [auth.isAuthenticated, profile, location.pathname, navigate]);

    if (auth.isLoading) {
        return <FullScreenLoader message="VERIFYING ACCESS..." />;
    }

    if (auth.error) {
        navigate('/home', { replace: true });
        return null;
    }

    if (!auth.isAuthenticated) {
        auth.signinRedirect();
        return null;
    }

    if (profileLoading) {
        return <FullScreenLoader message="LOADING PROFILE..." />;
    }

    return <>{children}</>;
}
```
- Create a custom registration page using react. Follow the same color pattern. 
- use react hooks form.
- Require fields : {"field" : "name", label: "Full Name"}
- Require fields : {"field" : "email", label: "Email"}
- Require fields : {"field" : "phone", label: "Phone Number"} --- This must include the area code.
- Require fields : {"field" : "password", label: "Password"}
- Require fields : {"field" : "confirmPassword", label: "Confirm Password"}
- Require fields : {"field" : "nit", label: "NIT"}
