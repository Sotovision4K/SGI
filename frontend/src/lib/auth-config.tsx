import {AuthProvider, type AuthProviderProps} from "react-oidc-context"

// eslint-disable-next-line react-refresh/only-export-components
export const cognitoConfig: AuthProviderProps = {
    authority: import.meta.env.VITE_COGNITO_AUTHORITY as string,
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
    redirect_uri: import.meta.env.VITE_REDIRECT_URI as string,
    post_logout_redirect_uri: import.meta.env.VITE_REDIRECT_SIGN_OUT as string,
    response_type: 'code',
    scope: "openid email phone",
} as const;


export const CognitoAuthProvider = ({children}: {children: React.ReactNode}) => {

    return (
        <AuthProvider {...cognitoConfig}>
            {children}
        </AuthProvider>
    )
}