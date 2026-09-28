import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Stethoscope, HeartPulse, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button, Card, Field, Alert } from '../components/ui';
import api from '../services/api';

const DEMO_ACCOUNTS = {
  patient: { userId: 'alice', password: 'alicepw', label: 'Patient', Icon: User, blurb: 'Issue consent and generate proofs' },
  provider: { userId: 'drbob', password: 'bobpw', label: 'Provider', Icon: Stethoscope, blurb: 'Verify proofs submitted by patients' },
};

export function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('patient');
  const [userId, setUserId] = useState('alice');
  const [password, setPassword] = useState('alicepw');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const selectDemo = (key) => {
    const acct = DEMO_ACCOUNTS[key];
    setRole(key);
    setUserId(acct.userId);
    setPassword(acct.password);
    setFieldErrors({});
    setError('');
  };

  const validate = () => {
    const errs = {};
    if (!userId.trim()) errs.userId = 'Enter your user ID.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await api.post('/auth/login', { userId: userId.trim(), password });

      // Frozen contract: response carries `accessToken` and an uppercase role.
      localStorage.setItem('token', res.data.accessToken);
      localStorage.setItem('role', res.data.role.toLowerCase());
      localStorage.setItem('username', userId.trim());

      navigate(res.data.role.toLowerCase() === 'patient' ? '/patient' : '/provider');
    } catch (err) {
      const apiError = err.response?.data?.error;
      setError(apiError?.message || 'We could not sign you in. Check your credentials and try again.');
      setFieldErrors({});
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="container-page flex min-h-screen flex-col py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 self-start text-sm text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to overview
        </Link>

        <div className="flex flex-grow items-center justify-center py-8">
          <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1fr_1.05fr]">
            {/* Clinic context panel */}
            <div className="hidden flex-col justify-between surface p-7 lg:flex">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-control bg-accent-500/12 text-accent-300">
                  <HeartPulse className="h-6 w-6" aria-hidden="true" />
                </span>
                <h1 className="mt-6 font-display text-2xl font-semibold text-ink">ZKHealthPass</h1>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Consent-based access to electronic health records, verified with zero-knowledge proofs.
                </p>
              </div>

              <ul className="mt-8 space-y-3.5 text-sm text-ink-muted">
                {[
                  'Authorisations are scoped per provider and per record category.',
                  'Proofs carry no record content and no patient identity.',
                  'Every granted access is written to an immutable audit trail.',
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-400" aria-hidden="true" />
                    {line}
                  </li>
                ))}
              </ul>

              <p className="mt-8 border-t border-hairline pt-5 text-[13px] text-ink-faint">
                Demonstration accounts are provided for evaluation. Real deployments authenticate against a
                clinical identity provider.
              </p>
            </div>

            {/* Sign-in form */}
            <Card className="p-7">
              <h2 className="font-display text-xl font-semibold text-ink">Sign in</h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Choose a workspace, then authenticate.
              </p>

              {/* Demo quick-switcher */}
              <div className="mt-6 grid grid-cols-2 gap-2" role="group" aria-label="Demo account">
                {Object.entries(DEMO_ACCOUNTS).map(([key, acct]) => {
                  const active = role === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectDemo(key)}
                      aria-pressed={active}
                      className={`rounded-control border p-3 text-left transition-colors ${
                        active
                          ? 'border-accent-500 bg-accent-500/10'
                          : 'border-hairline bg-surface-sunken hover:border-hairline-strong'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <acct.Icon
                          className={`h-4 w-4 ${active ? 'text-accent-300' : 'text-ink-faint'}`}
                          aria-hidden="true"
                        />
                        <span className={`text-sm font-semibold ${active ? 'text-accent-200' : 'text-ink'}`}>
                          {acct.label}
                        </span>
                      </span>
                      <span className="mt-1 block text-[12px] leading-snug text-ink-faint">{acct.blurb}</span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleLogin} className="mt-6 space-y-4" noValidate>
                <Field label="User ID" htmlFor="userId" error={fieldErrors.userId} required>
                  <input
                    id="userId"
                    name="userId"
                    type="text"
                    autoComplete="username"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="control"
                    placeholder="alice"
                    aria-invalid={Boolean(fieldErrors.userId)}
                  />
                </Field>

                <Field label="Password" htmlFor="password" error={fieldErrors.password} required>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="control pr-11"
                      placeholder="••••••••"
                      aria-invalid={Boolean(fieldErrors.password)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-faint hover:text-ink transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                {error && <Alert variant="error" title="Sign-in failed">{error}</Alert>}

                <Button type="submit" size="lg" className="w-full" loading={loading}>
                  {loading ? 'Authenticating…' : 'Continue to workspace'}
                </Button>
              </form>

              <p className="mt-5 border-t border-hairline pt-4 text-[13px] leading-relaxed text-ink-faint">
                Your role is determined by the account record, not by the workspace you pick here.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
