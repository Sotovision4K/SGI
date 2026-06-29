import {AuthProvider, type AuthProviderProps} from "react-oidc-context"
import { Log } from "oidc-client-ts"

// Enable verbose OIDC logging for debugging token exchange
Log.setLogger(console)
Log.setLevel(Log.DEBUG)

// eslint-disable-next-line react-refresh/only-export-components
export const cognitoConfig: AuthProviderProps = {
    authority : import.meta.env.VITE_COGNITO_AUTHORITY,
    client_id : import.meta.env.VITE_COGNITO_CLIENT_ID,
    redirect_uri : import.meta.env.VITE_REDIRECT_URI,
    post_logout_redirect_uri : import.meta.env.VITE_REDIRECT_SIGN_OUT,
    response_type : 'code',
    scope: "openid email phone",
    // CSRF: oidc-client-ts validates state internally.
    // Use location.replace (not history API) to prevent React re-renders
    // that can trigger a second code exchange → "invalid_grant".
    // SignInPage's useEffect handles the final redirect to /processes.
    onSigninCallback: () => {
        window.location.replace(window.location.pathname);
    }
} as const;


export const CognitoAuthProvider = ({children}: {children: React.ReactNode}) => {

    return (
        <AuthProvider {...cognitoConfig}>
            {children}
        </AuthProvider>
    )
}