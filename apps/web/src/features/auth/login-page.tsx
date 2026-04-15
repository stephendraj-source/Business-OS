import React, { useState, useEffect } from 'react';
import { useAuth } from '@/app/providers/AuthContext';
import { Building2, Mail, Lock, LogIn, Eye, EyeOff, ArrowLeft, Copy, Check, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { copyToClipboard } from '@/shared/lib/utils';
import { BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY, setStoredValue } from '@/shared/lib/storage';

type View = 'login' | 'forgot' | 'temp-password' | 'set-password' | 'register' | 'reset-via-link' | 'reset-success';

export function LoginPage() {
  const { login, completeSetPassword } = useAuth();

  // Detect if we're on /reset-password?token=... URL
  const initialView: View = (() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('token') && window.location.pathname.includes('reset-password')) {
        return 'reset-via-link';
      }
    }
    return 'login';
  })();

  const [view, setView] = useState<View>(initialView);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [copied, setCopied] = useState(false);

  // Force-change-password state
  const [changeToken, setChangeToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState('');
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);

  // Registration state
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  // Reset via link state
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      if (t) setResetToken(t);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    if (result.mustChangePassword && result.changeToken) {
      setChangeToken(result.changeToken);
      setView('set-password');
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setSetPasswordError('');
    if (newPassword.length < 8) { setSetPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setSetPasswordError('Passwords do not match'); return; }
    setSetPasswordLoading(true);
    const result = await completeSetPassword(changeToken, newPassword);
    setSetPasswordLoading(false);
    if (result.error) setSetPasswordError(result.error);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setForgotError(data.error || 'Something went wrong'); setForgotLoading(false); return; }
      setTempPassword(data.tempPassword);
      setRecipientName(data.name || '');
      setView('temp-password');
    } catch {
      setForgotError('Network error — please try again');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError('');
    if (regPassword.length < 8) { setRegError('Password must be at least 8 characters'); return; }
    if (regPassword !== regConfirm) { setRegError('Passwords do not match'); return; }
    setRegLoading(true);
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: regFirstName.trim(), lastName: regLastName.trim(), email: regEmail.trim(), password: regPassword }),
      });
      const data = await r.json();
      if (!r.ok) { setRegError(data.error || 'Registration failed'); setRegLoading(false); return; }
      // Auto-login: store token and reload
      setStoredValue(BUSINESS_OS_TOKEN_KEY, data.token, LEGACY_NONPROFIT_OS_TOKEN_KEY);
      window.location.href = '/';
    } catch {
      setRegError('Network error — please try again');
    } finally {
      setRegLoading(false);
    }
  }

  async function handleResetViaLink(e: React.FormEvent) {
    e.preventDefault();
    setResetError('');
    if (resetNewPassword.length < 8) { setResetError('Password must be at least 8 characters'); return; }
    if (resetNewPassword !== resetConfirm) { setResetError('Passwords do not match'); return; }
    setResetLoading(true);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword: resetNewPassword }),
      });
      const data = await r.json();
      if (!r.ok) { setResetError(data.error || 'Reset failed'); setResetLoading(false); return; }
      setView('reset-success');
      // Clean the URL
      window.history.replaceState({}, '', '/');
    } catch {
      setResetError('Network error — please try again');
    } finally {
      setResetLoading(false);
    }
  }

  function copyTemp() {
    copyToClipboard(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function reset() {
    setView('login');
    setForgotEmail('');
    setForgotError('');
    setTempPassword('');
    setRecipientName('');
    setCopied(false);
  }

  const subtitle: Record<View, string> = {
    login: 'Sign in to your account',
    forgot: 'Reset your password',
    'temp-password': 'Temporary password generated',
    'set-password': 'Set your new password',
    register: 'Create a new account',
    'reset-via-link': 'Set your new password',
    'reset-success': 'Password updated',
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight">BusinessOS</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle[view]}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-xl p-8">

          {/* ── Login form ─────────────────────────── */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Password</label>
                  <button
                    type="button"
                    onClick={() => { setView('forgot'); setForgotEmail(email); setForgotError(''); }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-9 pr-10 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs text-muted-foreground bg-card px-2">or</div>
              </div>

              <button
                type="button"
                onClick={() => { setView('register'); setRegError(''); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Create a new account
              </button>
            </form>
          )}

          {/* ── Registration form ───────────────────── */}
          {view === 'register' && (
            <div className="space-y-5">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">First name</label>
                    <input
                      type="text"
                      value={regFirstName}
                      onChange={e => setRegFirstName(e.target.value)}
                      placeholder="Jane"
                      required
                      autoFocus
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Last name</label>
                    <input
                      type="text"
                      value={regLastName}
                      onChange={e => setRegLastName(e.target.value)}
                      placeholder="Smith"
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Confirm password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regConfirm}
                      onChange={e => setRegConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>

                {regError && (
                  <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {regError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {regLoading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {regLoading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot password form ────────────────── */}
          {view === 'forgot' && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Enter your email address and we'll generate a temporary password you can use to sign in.
              </p>
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>

                {forgotError && (
                  <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {forgotError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 transition-all"
                >
                  {forgotLoading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  {forgotLoading ? 'Generating…' : 'Generate temporary password'}
                </button>
              </form>

              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Force set password ──────────────────── */}
          {view === 'set-password' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <ShieldCheck className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Welcome! Your account requires a new password before you can continue.
                </p>
              </div>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      autoFocus
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Confirm new password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      required
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>
                {setPasswordError && (
                  <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {setPasswordError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={setPasswordLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {setPasswordLoading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  {setPasswordLoading ? 'Saving…' : 'Set password & continue'}
                </button>
              </form>
            </div>
          )}

          {/* ── Reset via admin link ─────────────────── */}
          {view === 'reset-via-link' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <KeyRound className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  Choose a new password for your account. This link expires after 24 hours.
                </p>
              </div>
              <form onSubmit={handleResetViaLink} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={resetNewPassword}
                      onChange={e => setResetNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      autoFocus
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Confirm new password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={resetConfirm}
                      onChange={e => setResetConfirm(e.target.value)}
                      placeholder="Re-enter your new password"
                      required
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>
                {resetError && (
                  <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {resetError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {resetLoading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  {resetLoading ? 'Saving…' : 'Set new password'}
                </button>
              </form>

              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Reset success ────────────────────────── */}
          {view === 'reset-success' && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-2">
                  <Check className="w-6 h-6 text-green-500" />
                </div>
                <p className="text-sm font-medium">Password updated successfully</p>
                <p className="text-xs text-muted-foreground">You can now sign in with your new password.</p>
              </div>
              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-all"
              >
                <LogIn className="w-4 h-4" />
                Sign in
              </button>
            </div>
          )}

          {/* ── Temp password reveal ─────────────────── */}
          {view === 'temp-password' && (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 mb-2">
                  <KeyRound className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm font-medium">Temporary password ready{recipientName ? ` for ${recipientName}` : ''}</p>
                <p className="text-xs text-muted-foreground">This replaces your current password. Copy it and use it to sign in, then change it from your profile.</p>
              </div>

              <div className="bg-muted/60 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <code className="text-base font-mono font-bold tracking-widest text-foreground flex-1 text-center select-all">
                    {tempPassword}
                  </code>
                  <button
                    onClick={copyTemp}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-secondary transition-colors flex-shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">This password is shown only once</p>
              </div>

              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-all"
              >
                <LogIn className="w-4 h-4" />
                Back to sign in
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          {view === 'login' || view === 'register'
            ? 'Contact your administrator if you need help with your account.'
            : 'Secure access to your BusinessOS workspace.'}
        </p>
      </div>
    </div>
  );
}
