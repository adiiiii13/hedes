import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud, CloudOff, LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { syncLocalHistory, type CloudSyncResult } from '~/utils/cloud-sync.client';

type CloudConfig = { apiUrl: string; userPoolId: string; clientId: string; region: string };
type AuthApi = {
  signIn: (input: { username: string; password: string; options?: { authFlowType?: 'USER_SRP_AUTH' } }) => Promise<any>;
  confirmSignIn: (input: { challengeResponse: string }) => Promise<any>;
  signOut: () => Promise<void>;
  fetchAuthSession: () => Promise<any>;
  getCurrentUser: () => Promise<{ username: string; userId: string }>;
};

let configuredKey = '';
let authApiPromise: Promise<AuthApi> | undefined;

function readConfig(): CloudConfig {
  const userPoolId = import.meta.env.VITE_HEDES_CLOUD_USER_POOL_ID?.trim() ?? '';
  return {
    apiUrl: import.meta.env.VITE_HEDES_CLOUD_API_URL?.trim() ?? '',
    userPoolId,
    clientId: import.meta.env.VITE_HEDES_CLOUD_CLIENT_ID?.trim() ?? '',
    region: userPoolId.split('_')[0] || '',
  };
}

function createSessionStorage() {
  const memory = new Map<string, string>();
  const get = (key: string) => {
    try { return window.sessionStorage.getItem(key); } catch { return memory.get(key) ?? null; }
  };
  const set = (key: string, value: string) => {
    try { window.sessionStorage.setItem(key, value); } catch { memory.set(key, value); }
  };
  const remove = (key: string) => {
    try { window.sessionStorage.removeItem(key); } catch { memory.delete(key); }
  };
  return {
    getItem: async (key: string) => get(key),
    setItem: async (key: string, value: string) => { set(key, value); },
    removeItem: async (key: string) => { remove(key); },
    clear: async () => {
      try {
        const keys = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index))
          .filter((key): key is string => Boolean(key?.startsWith('CognitoIdentityServiceProvider.')));
        keys.forEach(remove);
      } catch { memory.clear(); }
    },
  };
}

async function getAuthApi(config: CloudConfig): Promise<AuthApi> {
  const configKey = `${config.userPoolId}:${config.clientId}`;
  if (!authApiPromise || configuredKey !== configKey) {
    authApiPromise = (async () => {
      const [{ Amplify }, auth, cognito] = await Promise.all([
        import('@aws-amplify/core'),
        import('@aws-amplify/auth'),
        import('@aws-amplify/auth/cognito'),
      ]);
      Amplify.configure({ Auth: { Cognito: { userPoolId: config.userPoolId, userPoolClientId: config.clientId } } });
      cognito.cognitoUserPoolsTokenProvider.setKeyValueStorage(createSessionStorage());
      configuredKey = configKey;
      return auth as unknown as AuthApi;
    })();
  }
  return authApiPromise;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Cloud request failed');
  if (/NotAuthorizedException/i.test(message)) return 'Email or password is incorrect.';
  if (/UserNotFoundException/i.test(message)) return 'This email does not have a HEDES beta invitation yet.';
  if (/UserNotConfirmedException/i.test(message)) return 'Confirm your email before signing in.';
  return message.slice(0, 240);
}

export const CloudSyncSettings: React.FC = () => {
  const config = useMemo(readConfig, []);
  const configured = Boolean(config.apiUrl && config.userPoolId && config.clientId);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<'NEW_PASSWORD_REQUIRED' | 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' | null>(null);
  const [challengeValue, setChallengeValue] = useState('');
  const [username, setUsername] = useState('');
  const [accountId, setAccountId] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<CloudSyncResult | null>(null);

  const refreshAccount = useCallback(async () => {
    if (!configured) return;
    try {
      const api = await getAuthApi(config);
      const user = await api.getCurrentUser();
      setUsername(user.username);
      setAccountId(user.userId);
      setSignedIn(true);
    } catch {
      setSignedIn(false);
      setUsername('');
      setAccountId('');
    }
  }, [config, configured]);

  useEffect(() => { void refreshAccount(); }, [refreshAccount]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const api = await getAuthApi(config);
      const result = await api.signIn({ username: email.trim(), password, options: { authFlowType: 'USER_SRP_AUTH' } });
      setPassword('');
      if (result.isSignedIn) {
        setChallenge(null);
        await refreshAccount();
        setMessage('Signed in. Your local history stays local until you choose Sync now.');
      } else {
        const step = result.nextStep?.signInStep;
        if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') setChallenge('NEW_PASSWORD_REQUIRED');
        else if (step === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') setChallenge('CONFIRM_SIGN_IN_WITH_TOTP_CODE');
        else throw new Error(`This sign-in requires an unsupported verification step (${step || 'unknown'}).`);
      }
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };

  const handleChallenge = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const api = await getAuthApi(config);
      const result = await api.confirmSignIn({ challengeResponse: challengeValue });
      setChallengeValue('');
      if (!result.isSignedIn) throw new Error('Additional sign-in verification is still required.');
      setChallenge(null); await refreshAccount(); setMessage('Signed in successfully.');
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };

  const handleSignOut = async () => {
    setBusy(true); setError('');
    try { const api = await getAuthApi(config); await api.signOut(); setSignedIn(false); setUsername(''); setAccountId(''); setLastResult(null); setIncludeHistory(false); setMessage('Signed out. Local chats and files remain on this device.'); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };

  const handleSync = async () => {
    setBusy(true); setError(''); setMessage(''); setLastResult(null);
    try {
      const api = await getAuthApi(config);
      const session = await api.fetchAuthSession();
      const accessToken = session.tokens?.accessToken?.toString();
      if (!accessToken) throw new Error('Your sign-in expired. Sign in again.');
      const result = await syncLocalHistory(config.apiUrl, accessToken, accountId);
      setLastResult(result);
      setMessage(`Sync finished: ${result.uploaded} uploaded, ${result.downloaded} downloaded.`);
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-5 text-slate-200">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-950/15 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-2 text-cyan-300"><Cloud className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">HEDES Cloud Sync</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Use the same account across your devices. Your local files and chats keep working offline.</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${signedIn ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-slate-500/30 bg-slate-500/10 text-slate-400'}`}>
            {signedIn ? 'ACCOUNT CONNECTED' : 'LOCAL ONLY'}
          </span>
        </div>

        {!configured ? (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/80">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <span>Cloud backend is not configured yet. After the AWS beta stack is deployed, add its API URL, Cognito User Pool ID, and App Client ID to the app environment, then restart HEDES.</span>
          </div>
        ) : signedIn ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><span className="font-medium text-white">{username}</span></div>
            <button type="button" disabled={busy} onClick={() => void handleSignOut()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50">Sign out</button>
          </div>
        ) : challenge ? (
          <form className="mt-4 space-y-3" onSubmit={handleChallenge}>
            <label className="block text-xs font-medium text-slate-300">{challenge === 'NEW_PASSWORD_REQUIRED' ? 'Choose a new password' : 'Authenticator code'}
              <input autoComplete={challenge === 'NEW_PASSWORD_REQUIRED' ? 'new-password' : 'one-time-code'} required type={challenge === 'NEW_PASSWORD_REQUIRED' ? 'password' : 'text'} minLength={challenge === 'NEW_PASSWORD_REQUIRED' ? 12 : 6} value={challengeValue} onChange={(e) => setChallengeValue(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" />
            </label>
            <button disabled={busy} className="rounded-xl bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50">{busy ? 'Verifying…' : 'Continue sign-in'}</button>
          </form>
        ) : (
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSignIn}>
            <label className="text-xs font-medium text-slate-300">Email
              <input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" />
            </label>
            <label className="text-xs font-medium text-slate-300">Password
              <input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50" />
            </label>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 sm:col-span-2"><LockKeyhole className="h-3.5 w-3.5 text-cyan-300" />Cognito SRP sign-in. Password is not stored by HEDES. Beta access is invitation-only.</div>
            <button disabled={busy} className="rounded-xl bg-cyan-500/15 px-4 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 sm:col-span-2">{busy ? 'Connecting…' : 'Sign in to HEDES Cloud'}</button>
          </form>
        )}
      </div>

      {signedIn && (
        <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
          <h4 className="text-sm font-bold text-white">Sync chat history</h4>
          <p className="mt-1 text-xs leading-5 text-slate-400">Sync is manual. HEDES sends chat and 100-Council transcript text to your private HEDES cloud workspace. Screenshot attachments, project files, and delete propagation are not included yet.</p>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-300">
            <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} className="mt-1 accent-cyan-400" />
            <span>I want to sync my chat and Council transcript text to HEDES Cloud. I will not paste API keys, passwords, or private credentials into messages.</span>
          </label>
          <button type="button" disabled={busy || !includeHistory} onClick={() => void handleSync()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{busy ? 'Syncing…' : 'Sync now'}
          </button>
          {lastResult && (lastResult.conflicts.length > 0 || lastResult.skipped.length > 0) && (
            <div className="mt-3 space-y-1 text-xs text-amber-200/90">
              {lastResult.conflicts.length > 0 && <p>{lastResult.conflicts.length} chat(s) changed on both devices. HEDES left them untouched to protect your data.</p>}
              {lastResult.skipped.length > 0 && <p>{lastResult.skipped.length} oversized or invalid record(s) skipped. Large project files are not part of history sync yet.</p>}
            </div>
          )}
        </div>
      )}

      {!signedIn && <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />Your chat history remains saved locally. Cloud sign-in does not upload anything by itself.</div>}
      {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </section>
  );
};
