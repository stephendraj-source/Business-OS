import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Mail, Lock, LogIn, Eye, EyeOff, ArrowLeft, Copy, Check, KeyRound } from 'lucide-react';

type View = 'login' | 'forgot' | 'temp-password';

export function LoginPage() {
  const { login } = useAuth();
  const [view, setView] = useState<View>('login');

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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
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

  function copyTemp() {
    navigator.clipboard.writeText(tempPassword).then(() => {
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight">BusinessOS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {view === 'login' ? 'Sign in to your account' : view === 'forgot' ? 'Reset your password' : 'Temporary password generated'}
          </p>
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
            </form>
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
          Contact your administrator if you need access.
        </p>
      </div>
    </div>
  );
}
