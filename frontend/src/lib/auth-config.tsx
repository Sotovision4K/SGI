import {AuthProvider, type AuthProviderProps} from "react-oidc-context"
import { Log, WebStorageStateStore } from "oidc-client-ts"

// Enable verbose OIDC logging for debugging
Log.setLogger(console)
Log.setLevel(Log.DEBUG)

// Use localStorage instead of sessionStorage for OIDC state
// sessionStorage is being cleared during the Cognito redirect,
// causing PKCE code_verifier to be lost → invalid_grant
const storage = new WebStorageStateStore({ store: localStorage })

// eslint-disable-next-line react-refresh/only-export-components
export const cognitoConfig: AuthProviderProps = {
    authority: import.meta.env.VITE_COGNITO_AUTHORITY as string,
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
    redirect_uri: import.meta.env.VITE_REDIRECT_URI as string,
    post_logout_redirect_uri: import.meta.env.VITE_REDIRECT_SIGN_OUT as string,
    response_type: 'code',
    scope: "openid email phone",
    stateStore: storage,
    userStore: storage,
} as const;


export const CognitoAuthProvider = ({children}: {children: React.ReactNode}) => {

    return (
        <AuthProvider {...cognitoConfig}>
            {children}
        </AuthProvider>
    )
}