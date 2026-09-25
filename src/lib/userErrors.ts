import { ApiError } from './api';

type ErrorTone = 'warning' | 'danger' | 'info';

export interface UserErrorCopy {
  title: string;
  message: string;
  tone: ErrorTone;
}

export const USER_ERRORS = {
  accountLookupUnavailable: {
    title: 'Account check unavailable',
    message: 'We could not check that account right now. Make sure the app server is running, then try again.',
    tone: 'warning',
  },
  accountNotFound: {
    title: 'No workspace found',
    message: 'No workspace is linked to this email or username. Create a workspace first.',
    tone: 'danger',
  },
  invalidLogin: {
    title: 'Login failed',
    message: 'The email, username, or passcode is not correct.',
    tone: 'danger',
  },
  sessionExpired: {
    title: 'Session expired',
    message: 'Please log in again to continue.',
    tone: 'warning',
  },
  workspaceCreateFailed: {
    title: 'Workspace could not be created',
    message: 'Try another workspace name or email, then submit again.',
    tone: 'danger',
  },
  serverUnavailable: {
    title: 'Connection problem',
    message: 'We could not reach the app server. Start the server and try again.',
    tone: 'warning',
  },
  generic: {
    title: 'Something went wrong',
    message: 'Please try again in a moment.',
    tone: 'danger',
  },
} satisfies Record<string, UserErrorCopy>;

export type UserErrorKey = keyof typeof USER_ERRORS;

export function getUserError(key: UserErrorKey): UserErrorCopy {
  return USER_ERRORS[key];
}

export function userErrorMessage(key: UserErrorKey): string {
  return USER_ERRORS[key].message;
}

export function userErrorFromUnknown(error: unknown): UserErrorCopy {
  if (error instanceof ApiError) {
    if (error.code === 'auth_expired') return USER_ERRORS.sessionExpired;
    if (error.code === 'unauthorized') return USER_ERRORS.invalidLogin;
    if (error.code === 'not_found') return USER_ERRORS.accountNotFound;
    if (['php_unreachable', 'php_unavailable', 'not_configured', 'supabase_unavailable'].includes(error.code)) {
      return USER_ERRORS.serverUnavailable;
    }
    if (error.code === 'conflict') return USER_ERRORS.workspaceCreateFailed;
    // Server messages written for end users — show them as-is.
    if (['suspended', 'validation', 'rate_limited', 'forbidden'].includes(error.code)) {
      return { title: 'Cannot continue', message: error.message, tone: 'warning' };
    }
  }

  const message = error instanceof Error ? error.message : '';
  if (/api|server|network|fetch|failed to fetch|unreachable|not configured/i.test(message)) {
    return USER_ERRORS.serverUnavailable;
  }
  return USER_ERRORS.generic;
}
