import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const COGNITO_REGION = COGNITO_USER_POOL_ID?.split('_')[0] || 'us-east-1';

const client = new CognitoIdentityProviderClient({ region: COGNITO_REGION });

interface CognitoAuthResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Map raw Cognito/AWS SDK errors to user-safe Spanish messages. Never leaks raw exception text. */
function mapCognitoError(error: unknown): string {
  const msg = error instanceof Error ? error.message : '';

  if (msg.includes('UserNotFoundException') || msg.includes('User does not exist')) {
    return 'No se encontró una cuenta con ese correo electrónico.';
  }
  if (msg.includes('NotAuthorizedException')) {
    return 'Credenciales incorrectas. Verifica tu correo y contraseña.';
  }
  if (msg.includes('InvalidPasswordException')) {
    return 'La contraseña no cumple con los requisitos de seguridad.';
  }
  if (msg.includes('UsernameExistsException')) {
    return 'Una cuenta con este correo ya existe. Por favor inicia sesión en su lugar.';
  }
  if (msg.includes('CodeMismatchException')) {
    return 'El código de verificación ingresado no es válido.';
  }
  if (msg.includes('ExpiredCodeException')) {
    return 'El código de verificación ha expirado. Solicita uno nuevo.';
  }
  if (msg.includes('LimitExceededException')) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  }
  if (msg.includes('InvalidParameterException') || msg.includes('write unauthorized attribute')) {
    return 'Algunos datos ingresados no son válidos. Verifica la información.';
  }

  // Log for debugging — never expose raw message to users
  console.error('[Auth]', new Date().toISOString(), msg);
  return 'Error inesperado. Contacta al administrador en soporte@sgipro.com.';
}

export async function signIn(email: string, password: string): Promise<CognitoAuthResponse> {
  try {
    const command = new InitiateAuthCommand({
      ClientId: COGNITO_CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const data = await client.send(command);
    return { success: true, data: data.AuthenticationResult };
  } catch (error) {
    return { success: false, error: mapCognitoError(error) };
  }
}

export async function signUp(
  email: string,
  password: string,
  attributes: {
    name: string;
    phone_number: string;
    'custom:govId': string;
    'custom:role': string;
  }
): Promise<CognitoAuthResponse> {
  try {
    const command = new SignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: attributes.name },
        { Name: 'phone_number', Value: attributes.phone_number },
        { Name: 'custom:govId', Value: attributes['custom:govId'] },
        { Name: 'custom:role', Value: attributes['custom:role'] },
      ],
    });

    const data = await client.send(command);
    return { success: true, data: { userSub: data.UserSub } };
  } catch (error) {
    return { success: false, error: mapCognitoError(error) };
  }
}

export async function confirmSignUp(email: string, code: string): Promise<CognitoAuthResponse> {
  try {
    const command = new ConfirmSignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    });

    await client.send(command);
    return { success: true, data: {} };
  } catch (error) {
    return { success: false, error: mapCognitoError(error) };
  }
}

export async function resendConfirmationCode(email: string): Promise<CognitoAuthResponse> {
  try {
    const command = new ResendConfirmationCodeCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
    });

    const data = await client.send(command);
    return { success: true, data: data.CodeDeliveryDetails };
  } catch (error) {
    return { success: false, error: mapCognitoError(error) };
  }
}

export function isUserNotFoundError(error: string): boolean {
  return error.includes('UserNotFoundException') || error.includes('User does not exist');
}

export function isInvalidPasswordError(error: string): boolean {
  return error.includes('InvalidPasswordException');
}

export function isUsernameExistsError(error: string): boolean {
  return error.includes('UsernameExistsException');
}

export function isExpiredCodeError(error: string): boolean {
  return error.includes('ExpiredCodeException');
}

export function isUnauthorizedAttributeError(error: string): boolean {
  return error.includes('write unauthorized attribute') ||
         error.includes('InvalidParameterException');
}

export function isLimitExceededError(error: string): boolean {
  return error.includes('LimitExceededException');
}

export function isCodeMismatchError(error: string): boolean {
  return error.includes('CodeMismatchException');
}

export function isNotAuthorizedError(error: string): boolean {
  return error.includes('NotAuthorizedException');
}