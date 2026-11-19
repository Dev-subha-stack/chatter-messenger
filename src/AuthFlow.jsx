import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUp, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from './supabase';

const LAST_EMAIL_KEY = 'chatter-last-email';
const EMAIL_COOLDOWN_KEY = 'chatter-auth-email-cooldown-until';
const normaliseEmail = value => value.trim().toLowerCase();
const formatCooldown = seconds => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${remainder}s`;
};

function getFriendlyAuthError(error, mode) {
  const message = String(error?.message || error || '');
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  if (code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(message)) {
    return {
      kind: 'email-limit',
      message: 'Chatter has reached its current email-sending limit. Password sign-in still works for existing confirmed accounts. Please use Sign in instead of creating another account, and try email confirmation again later.',
    };
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return {
      kind: 'unconfirmed',
      message: 'This account still needs email confirmation. Check your inbox and spam folder, or request one confirmation email below after the short cooldown.',
    };
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return {
      kind: 'credentials',
      message: 'That email and password do not match. Check both fields, or use Forgot password to set a new password.',
    };
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /user already registered|already been registered/i.test(message)) {
    return {
      kind: 'exists',
      message: 'An account may already exist with this email. Switch to Sign in, or use Forgot password if you cannot remember the password.',
    };
  }
  if (code === 'over_request_rate_limit' || status === 429 || /too many requests|rate limit/i.test(message)) {
    return {
      kind: 'request-limit',
      message: 'Chatter is receiving too many requests right now. Wait a little before trying again. Your account and password have not been changed.',
    };
  }
  if (/failed to fetch|network request failed|fetch error|networkerror|load failed/i.test(message)) {
    return {
      kind: 'network',
      message: 'Could not reach Chatter securely. Check your internet connection, then try again. Your account details have been kept on this device.',
    };
  }
  if (/one-time token not found|token has expired|invalid.*token|otp_expired/i.test(message) || code === 'otp_expired') {
    return {
      kind: 'expired-link',
      message: 'That email link has expired or was already used. Return to Chatter and request a fresh link once the email cooldown has ended.',
    };
  }
  if (/weak password|password should be/i.test(message)) {
    return { kind: 'password', message: 'Choose a stronger password and try again.' };
  }
  if (mode === 'login' && message) {
    return { kind: 'generic-login', message };
  }
  return { kind: 'generic', message: message || 'Something went wrong. Please try again.' };
}

export function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(() => {
    try {
      const until = Number(localStorage.getItem(EMAIL_COOLDOWN_KEY) || 0);
      return Math.max(0, Math.ceil((until - Date.now()) / 1000));
    } catch { return 0; }
  });

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      try { localStorage.removeItem(EMAIL_COOLDOWN_KEY); } catch {}
      return;
    }
    const timer = window.setTimeout(() => setCooldownSeconds(current => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    const callbackError = hashParams.get('error_description') || queryParams.get('error_description');
    if (callbackError) {
      const friendly = getFriendlyAuthError(callbackError, 'login');
      setError(friendly.message);
    }
  }, []);

  const changeMode = nextMode => {
    setMode(nextMode);
    setError('');
    setNotice('');
    setEmailNotConfirmed(false);
    setShowPassword(false);
  };

  const startEmailCooldown = seconds => {
    const until = Date.now() + seconds * 1000;
    setCooldownSeconds(seconds);
    try { localStorage.setItem(EMAIL_COOLDOWN_KEY, String(until)); } catch {}
  };

  const saveEmail = value => {
    const cleaned = normaliseEmail(value);
    setEmail(cleaned);
    try { localStorage.setItem(LAST_EMAIL_KEY, cleaned); } catch {}
  };

  const submit = async event => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const cleanedEmail = normaliseEmail(email);
    saveEmail(cleanedEmail);
    try {
      if (mode === 'forgot') {
        if (cooldownSeconds > 0) throw new Error(`Please wait ${formatCooldown(cooldownSeconds)} before requesting another email.`);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanedEmail, {
          redirectTo: 'https://chatter22.vercel.app/',
        });
        if (resetError) throw resetError;
        startEmailCooldown(60);
        setNotice('Password reset email requested. Check your inbox and spam folder. The link opens Chatter so you can choose a new password.');
      } else if (mode === 'signup') {
        if (cooldownSeconds > 0) throw new Error(`Please wait ${formatCooldown(cooldownSeconds)} before requesting another confirmation email.`);
        const username = (name.trim() || cleanedEmail.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
        const { data, error: signupError } = await supabase.auth.signUp({
          email: cleanedEmail,
          password,
          options: {
            emailRedirectTo: 'https://chatter22.vercel.app/',
            data: { display_name: name.trim() || cleanedEmail.split('@')[0], username },
          },
        });
        if (signupError) throw signupError;
        if (!data.session) {
          startEmailCooldown(60);
          setEmailNotConfirmed(true);
          setNotice('If this is a new account, a confirmation link has been requested. Do not create the account repeatedly. Once confirmed, return to Sign in. If this email is already registered, use Sign in or Forgot password.');
        } else {
          setNotice('Your account is ready. You are signed in.');
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: cleanedEmail,
          password,
        });
        if (loginError) throw loginError;
      }
    } catch (caught) {
      const friendly = getFriendlyAuthError(caught, mode);
      setError(friendly.message);
      if (friendly.kind === 'unconfirmed') setEmailNotConfirmed(true);
      if (friendly.kind === 'email-limit') startEmailCooldown(15 * 60);
      if (friendly.kind === 'request-limit') startEmailCooldown(60);
      if (friendly.kind === 'expired-link') setEmailNotConfirmed(mode === 'signup');
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    const cleanedEmail = normaliseEmail(email);
    if (!cleanedEmail) { setError('Enter your email address first.'); return; }
    if (cooldownSeconds > 0) {
      setError(`Please wait ${formatCooldown(cooldownSeconds)} before requesting another email.`);
      return;
    }
    setError('');
    setNotice('');
    setResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: cleanedEmail,
        options: { emailRedirectTo: 'https://chatter22.vercel.app/' },
      });
      if (resendError) throw resendError;
      startEmailCooldown(60);
      setNotice('A confirmation email has been requested. Check your inbox and spam folder.');
    } catch (caught) {
      const friendly = getFriendlyAuthError(caught, 'signup');
      setError(friendly.message);
      if (friendly.kind === 'email-limit') startEmailCooldown(15 * 60);
      else if (friendly.kind === 'request-limit') startEmailCooldown(60);
    } finally {
      setResending(false);
    }
  };

  const showResend = emailNotConfirmed || (mode === 'signup' && Boolean(notice));
  const canSendEmail = cooldownSeconds <= 0 && !busy && !resending;

  return <div className="auth-shell">
    <div className="auth-backdrop glow-one"/><div className="auth-backdrop glow-two"/>
    <div className="auth-card auth-card-improved">
      <div className="brand-mark"><Mail size={22}/><span>chatter</span><i/></div>
      <div className="auth-intro">
        <div className="eyebrow"><Sparkles size={13}/> YOUR SPACE, YOUR PEOPLE</div>
        <h1>{mode === 'forgot' ? <>Reset your<br/><em>password.</em></> : mode === 'signup' ? <>Create your<br/><em>Chatter account.</em></> : <>Good conversations<br/><em>start here.</em></>}</h1>
        <p>{mode === 'forgot' ? 'We will email you a secure link to set a new password.' : mode === 'signup' ? 'Join your people and start chatting.' : 'Sign in with your email and password. This does not send an email.'}</p>
      </div>
      {mode !== 'forgot' && <div className="auth-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Sign in</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>Create account</button></div>}
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <label>Your name<input value={name} onChange={event => setName(event.target.value)} placeholder="How should people know you?" maxLength={32} required/></label>}
        <label>Email address<div className="input-icon"><Mail size={16}/><input type="email" value={email} onChange={event => saveEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" autoCapitalize="none" spellCheck="false" required/></div></label>
        {mode !== 'forgot' && <label>Password<div className="input-icon password-input-wrap"><Lock size={16}/><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Your password' : 'At least 6 characters'} minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required/><button type="button" className="auth-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>}
        {mode === 'login' && <div className="auth-link-row"><button type="button" className="auth-inline-link" onClick={() => changeMode('forgot')}>Forgot password?</button></div>}
        {error && <div className="form-error auth-feedback" role="alert">{error}</div>}
        {notice && <div className="form-notice auth-feedback" role="status">{notice}</div>}
        <button className="primary-button auth-submit" disabled={busy || (mode === 'signup' && cooldownSeconds > 0) || (mode === 'forgot' && cooldownSeconds > 0)}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Continue to Chatter' : mode === 'signup' ? (cooldownSeconds > 0 ? `Try again in ${formatCooldown(cooldownSeconds)}` : 'Create your account') : (cooldownSeconds > 0 ? `Try again in ${formatCooldown(cooldownSeconds)}` : 'Send reset link')}
          {mode !== 'forgot' && <ArrowUp size={16}/>}
        </button>
      </form>
      {showResend && <div className="auth-resend-panel"><div><b>Need another confirmation email?</b><small>Only request one when the previous link is missing or expired.</small></div><button type="button" className="auth-inline-link" onClick={resendConfirmation} disabled={!canSendEmail}>{resending ? 'Sending…' : cooldownSeconds > 0 ? `Wait ${formatCooldown(cooldownSeconds)}` : 'Resend confirmation'}</button></div>}
      {mode === 'forgot' ? <button type="button" className="auth-back-link" onClick={() => changeMode('login')}><ArrowLeft size={15}/> Back to sign in</button> : <div className="auth-switch-copy">{mode === 'login' ? <>New to Chatter? <button type="button" onClick={() => changeMode('signup')}>Create an account</button></> : <>Already have an account? <button type="button" onClick={() => changeMode('login')}>Sign in instead</button></>}</div>}
      <div className="auth-foot"><ShieldCheck size={14}/> Your password is checked securely. We never store it in this browser.</div>
      <div className="auth-provider-note">Google sign-in is temporarily unavailable while its provider is disabled in the authentication settings.</div>
    </div>
    <div className="auth-aside"><span>01 / PERSONAL</span><span>02 / REAL-TIME</span><span>03 / YOURS</span></div>
  </div>;
}

export function PasswordRecoveryModal({ onClose, onNotify }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters for your new password.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      onNotify?.('Password updated successfully.');
      window.history.replaceState({}, document.title, window.location.pathname);
      onClose();
    } catch (caught) {
      const friendly = getFriendlyAuthError(caught, 'reset');
      setError(friendly.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-scrim auth-recovery-scrim"><section className="auth-recovery-modal">
    <div className="brand-mark"><KeyRound size={21}/><span>chatter</span></div>
    <span className="eyebrow">ACCOUNT RECOVERY</span>
    <h2>Choose a new password</h2>
    <p>Set a new password for your Chatter account.</p>
    <form className="auth-form" onSubmit={submit}>
      <label>New password<div className="input-icon password-input-wrap"><Lock size={16}/><input type={showPassword?'text':'password'} value={password} onChange={event=>setPassword(event.target.value)} minLength={8} autoComplete="new-password" required/><button type="button" className="auth-password-toggle" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
      <label>Confirm new password<input type="password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required/></label>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <button className="primary-button auth-submit" disabled={busy}>{busy?'Updating…':'Update password'}<ArrowUp size={16}/></button>
    </form>
  </section></div>;
}
