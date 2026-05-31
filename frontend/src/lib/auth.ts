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
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return { success: false, error: message };
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
    const message = error instanceof Error ? error.message : 'Registration failed';
    return { success: false, error: message };
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
    const message = error instanceof Error ? error.message : 'Verification failed';
    return { success: false, error: message };
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
    const message = error instanceof Error ? error.message : 'Failed to resend code';
    return { success: false, error: message };
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