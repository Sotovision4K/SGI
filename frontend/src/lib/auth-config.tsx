import {AuthProvider, type AuthProviderProps} from "react-oidc-context"

// eslint-disable-next-line react-refresh/only-export-components
export const cognitoConfig: AuthProviderProps = {
    authority : import.meta.env.VITE_COGNITO_AUTHORITY,
    client_id : import.meta.env.VITE_COGNITO_CLIENT_ID,
    redirect_uri : import.meta.env.VITE_REDIRECT_URI,
    response_type : 'code',
    scope: "openid email phone",
    onSigninCallback: () =>{
        window.history.replaceState({}, document.title, window.location.pathname);
    }
} as const;


export const CognitoAuthProvider = ({children}: {children: React.ReactNode}) => {

    return (
        <AuthProvider {...cognitoConfig}>
            {children}
        </AuthProvider>
    )
}