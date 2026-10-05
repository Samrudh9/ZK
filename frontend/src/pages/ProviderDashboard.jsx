import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Ban,
  FileWarning,
  Clock,
  Fingerprint,
  ClipboardPaste,
  Activity,
  Link2,
} from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import {
  Button,
  Card,
  Field,
  Badge,
  Alert,
  EmptyState,
  ResultPanel,
  StatCard,
} from '../components/ui';
import api from '../services/api';

const SHAPE_HINT = 'Expected keys: proofId, proof (pi_a / pi_b / pi_c), publicSignals.';

/** Distinct, human-readable treatment per contract error code. */
const ERROR_PRESENTATION = {
  PROOF_REPLAYED: {
    Icon: Ban,
    title: 'Replay blocked',
    detail: 'This proof was already redeemed. Each proof is single-use, so a second submission is rejected.',
  },
  INVALID_PROOF: {
    Icon: FileWarning,
    title: 'Proof failed verification',
    detail: 'The submitted proof did not pass cryptographic verification. It may be altered or malformed.',
  },
  PROOF_EXPIRED: {
    Icon: Clock,
    title: 'Proof expired',
    detail: 'The validity window on this proof has passed. Ask the patient to generate a fresh one.',
  },
  POLICY_INACTIVE: {
    Icon: ShieldAlert,
    title: 'Consent policy not active',
    detail: 'The policy bound to this proof is revoked, expired, or its access budget is spent.',
  },
  POLICY_NOT_FOUND: {
    Icon: ShieldAlert,
    title: 'Consent policy not found',
    detail: 'The policy referenced by this proof no longer exists on the record.',
  },
  INVALID_JSON: {
    Icon: FileWarning,
    title: 'Unreadable payload',
    detail: 'The pasted text is not valid JSON, or is missing required fields.',
  },
};

export function ProviderDashboard() {
  const [payload, setPayload] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [parseError, setParseError] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setParseError('');

    // Client-side shape check before spending a round trip.
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setParseError('That text is not valid JSON. Copy the entire share payload from the patient.');
      return;
    }
    const missing = ['proofId', 'proof', 'publicSignals'].filter((k) => !(k in parsed));
    if (missing.length) {
      setParseError(`Missing required key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/proof/verify', parsed);
      setResult(res.data);
    } catch (err) {
      const apiError = err.response?.data?.error;
      setError(
        apiError || {
          code: 'UNKNOWN',
          message: 'Verification could not be completed. Please try again.',
        }
      );
    } finally {
      setLoading(false);
    }
  };

  const presentation = error ? ERROR_PRESENTATION[error.code] || null : null;
  const ErrorIcon = presentation?.Icon || ShieldAlert;
  const categories = result?.authorizedCategories || [];

  return (
    <div className="app-shell">
      <Navbar />

      <main className="container-page py-8 sm:py-10">
        <header className="mb-8">
          <p className="section-label">Provider workspace</p>
          <h1 className="mt-2">Proof verification</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-muted">
            Paste the proof a patient sent you. You will receive the categories you are authorised to access —
            not the records themselves.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          {/* ── Input ── */}
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control bg-accent-500/12 text-accent-300">
                <ClipboardPaste className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Patient proof</h2>
                <p className="mt-1 text-sm text-ink-muted">Paste the share JSON exactly as received.</p>
              </div>
            </div>

            <form onSubmit={handleVerify} className="mt-5" noValidate>
              <Field
                label="Proof payload"
                htmlFor="payload"
                error={parseError}
                hint={parseError ? undefined : SHAPE_HINT}
                required
              >
                <textarea
                  id="payload"
                  rows={12}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  spellCheck={false}
                  placeholder={'{\n  "proofId": "prf_…",\n  "proof": { "pi_a": […], "pi_b": […], "pi_c": […] },\n  "publicSignals": ["1", …]\n}'}
                  className="control resize-y font-mono text-xs leading-relaxed"
                  aria-invalid={Boolean(parseError)}
                />
              </Field>

              <Button
                type="submit"
                className="mt-4 w-full"
                loading={loading}
                disabled={!payload.trim()}
              >
                {loading ? 'Verifying…' : 'Verify proof'}
              </Button>
            </form>

            <p className="mt-4 border-t border-hairline pt-4 text-[13px] leading-relaxed text-ink-faint">
              Verification is cryptographically binding: a proof cannot be edited, reused, or redirected to a
              different policy or provider.
            </p>
          </Card>

          {/* ── Outcome ── */}
          <Card className="flex flex-col">
            <h2 className="font-display text-lg font-semibold text-ink">Verification result</h2>

            <div className="mt-5 flex-grow">
              {loading ? (
                <ResultPanel
                  state="loading"
                  loadingLabel="Checking the proof and consulting the ledger…"
                />
              ) : error ? (
                <div className="animate-enter space-y-4">
                  {/* Replay gets its own emphasised treatment — it's the expected
                      security outcome, not a generic failure. */}
                  {error.code === 'PROOF_REPLAYED' ? (
                    <div className="rounded-card border border-danger-line bg-danger-soft p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                          <Ban className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-lg font-bold text-danger">Replay blocked</h3>
                            <Badge status="PROOF_REPLAYED" />
                          </div>
                          <p className="mt-1.5 text-sm text-danger/90">{presentation.detail}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-card border border-hairline bg-surface-sunken p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-warning/12 text-warning">
                          <ErrorIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                          <h3 className="font-display text-base font-semibold text-ink">
                            {presentation?.title || 'Verification failed'}
                          </h3>
                          <p className="mt-1.5 text-sm text-ink-muted">
                            {presentation?.detail || error.message}
                          </p>
                          {error.message && error.message !== presentation?.detail && (
                            <p className="mt-2 text-[13px] text-ink-faint">{error.message}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Error code" value={error.code || '—'} mono />
                    <StatCard label="HTTP status" value={error.statusCode ?? '—'} />
                  </div>

                  {error.code === 'PROOF_REPLAYED' && (
                    <Alert variant="notice" title="What to do next">
                      Ask the patient to generate a new proof. Each successful verification consumes the access
                      budget on the underlying consent policy.
                    </Alert>
                  )}
                </div>
              ) : result ? (
                <div className="animate-enter space-y-5">
                  {/* Access granted */}
                  <div className="rounded-card border border-success-line bg-success-soft p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                          <h3 className="font-display text-xl font-bold tracking-tight text-success">
                            Access granted
                          </h3>
                          <p className="mt-1 text-sm text-success/90">
                            The proof is valid and the consent policy is active on the ledger.
                          </p>
                        </div>
                      </div>
                      <Badge status="ACCESS_GRANTED" />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-success/80">
                      <span>
                        valid: <span className="font-mono">{String(result.valid)}</span>
                      </span>
                      <span>
                        accessGranted: <span className="font-mono">{String(result.accessGranted)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Authorised categories */}
                  <div>
                    <p className="section-label">Authorised record categories</p>
                    {categories.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {categories.map((cat) => (
                          <span
                            key={cat}
                            className="inline-flex items-center gap-1.5 rounded-full border border-success-line bg-success-soft px-3 py-1 text-sm font-medium text-success"
                          >
                            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                            {cat}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <Alert variant="warning" className="mt-2.5">
                        The proof verified, but no record categories were authorised.
                      </Alert>
                    )}
                    <p className="mt-2.5 text-[13px] text-ink-faint">
                      The underlying records stay with the patient&rsquo;s provider of record; this proof
                      establishes authorisation, not the data itself.
                    </p>
                  </div>

                  {/* Ledger references */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard label="Transaction ID" value={result.txId} mono />
                    <StatCard label="Audit reference" value={result.auditRef} mono />
                  </div>

                  <div className="rounded-control border border-hairline bg-surface-sunken px-3.5 py-2.5">
                    <p className="flex items-center gap-2 text-[13px] text-ink-muted">
                      <Link2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      This proof is now consumed. Re-submitting it will be rejected as a replay.
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Fingerprint}
                  title="Awaiting a proof"
                  description="Paste the proof JSON a patient shared with you. Verification confirms their consent without exposing any clinical record content."
                />
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
