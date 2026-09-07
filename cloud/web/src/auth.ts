import {
  InteractionRequiredAuthError, PublicClientApplication, type AccountInfo,
} from '@azure/msal-browser';

const apiScope = import.meta.env.VITE_API_SCOPE;
const client = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: import.meta.env.VITE_ENTRA_AUTHORITY,
    knownAuthorities: [import.meta.env.VITE_ENTRA_KNOWN_AUTHORITY],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
});

export async function initializeAuthentication(): Promise<AccountInfo | null> {
  await client.initialize();
  const redirect = await client.handleRedirectPromise();
  const account = redirect?.account ?? client.getAllAccounts()[0] ?? null;
  if (account) client.setActiveAccount(account);
  return account;
}

export async function signIn(): Promise<AccountInfo> {
  const result = await client.loginPopup({ scopes: [apiScope], prompt: 'select_account' });
  if (!result.account) throw new Error('Microsoft sign-in did not return an account.');
  client.setActiveAccount(result.account);
  return result.account;
}

export async function signOut(): Promise<void> {
  const account = client.getActiveAccount();
  await client.logoutPopup(account ? { account } : {});
}

export async function getAccessToken(): Promise<string> {
  const account = client.getActiveAccount();
  if (!account) throw new Error('Sign in is required.');
  try {
    return (await client.acquireTokenSilent({ account, scopes: [apiScope] })).accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error;
    return (await client.acquireTokenPopup({ account, scopes: [apiScope] })).accessToken;
  }
}
