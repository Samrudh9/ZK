import React, { useState, useEffect, useCallback } from 'react';
import {
  FilePlus2,
  KeyRound,
  Copy,
  Check,
  FileKey2,
  ClipboardList,
  CalendarClock,
} from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import {
  Button,
  Card,
  Field,
  Badge,
  Alert,
  Toast,
  EmptyState,
  ResultPanel,
  StatCard,
} from '../components/ui';
import api from '../services/api';

const PROVIDERS = [
  { value: 'drbob', label: 'Dr. Bob — Cardiology' },
  { value: 'drsmith', label: 'Dr. Smith — General medicine' },
];

const CATEGORIES = ['Allergy', 'Vaccination', 'Surgery'];

const defaultValidUntil = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

export function PatientDashboard() {
  // policies
  const [policies, setPolicies] = useState([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [policiesError, setPoliciesError] = useState(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');

  // consent form
  const [providerId, setProviderId] = useState('drbob');
  const [categories, setCategories] = useState(['Allergy', 'Vaccination']);
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [consentErrors, setConsentErrors] = useState({});

  // async action states
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  // proof
  const [proof, setProof] = useState(null);
  const [proofError, setProofError] = useState(null);

  // toast
  const [toast, setToast] = useState(null);

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    setPoliciesError(null);
    try {
      const res = await api.get('/consent');
      const list = Array.isArray(res.data) ? res.data : [];
      setPolicies(list);
      setSelectedPolicyId((prev) => {
        if (prev && list.some((p) => p.policyId === prev)) return prev;
        const active = list.find((p) => p.status === 'ACTIVE');
        return active ? active.policyId : list[0]?.policyId || '';
      });
    } catch (err) {
      setPoliciesError(err.response?.data?.error?.message || 'We could not load your consent policies.');
    } finally {
      setPoliciesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const selectedPolicy = policies.find((p) => p.policyId === selectedPolicyId) || null;
  const canProve = Boolean(selectedPolicy) && selectedPolicy.status === 'ACTIVE' && categories.length > 0;

  const toggleCategory = (cat) => {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const validateConsent = () => {
    const errs = {};
    if (categories.length === 0) errs.categories = 'Select at least one record category.';
    if (!validUntil) errs.validUntil = 'Choose an expiry date.';
    else if (new Date(validUntil).getTime() <= Date.now()) {
      errs.validUntil = 'Expiry must be in the future.';
    }
    setConsentErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const createPolicy = async (e) => {
    e.preventDefault();
    setToast(null);
    if (!validateConsent()) return;

    setCreating(true);
    try {
      const res = await api.post('/consent', {
        providerId,
        allowedCategories: categories,
        validFrom: new Date().toISOString(),
        validUntil: new Date(validUntil).toISOString(),
        maxAccessCount: 5,
      });
      setSelectedPolicyId(res.data.policyId);
      setToast({
        variant: 'success',
        title: 'Consent policy created',
        message: `${res.data.policyId} is ${res.data.status.toLowerCase()}.`,
      });
      await loadPolicies();
    } catch (err) {
      const apiError = err.response?.data?.error;
      setToast({
        variant: 'error',
        title: 'Could not create policy',
        message: apiError?.message || 'The policy was not created. Please try again.',
      });
    } finally {
      setCreating(false);
    }
  };

  const generateProof = async () => {
    setToast(null);
    setProof(null);
    setProofError(null);
    setGenerating(true);
    try {
      const res = await api.post('/proof/generate', {
        providerId,
        recordCategories: categories,
        consentPolicyId: selectedPolicyId,
        expiry: new Date(Date.now() + 3600_000).toISOString(),
      });
      setProof(res.data);
      setToast({
        variant: 'success',
        title: 'Proof ready',
        message: 'Copy the share JSON and send it to your provider.',
      });
    } catch (err) {
      const apiError = err.response?.data?.error;
      setProofError({
        code: apiError?.code,
        message: apiError?.message || 'The proof could not be generated. Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const shareJson = proof
    ? JSON.stringify({ proofId: proof.proofId, proof: proof.proof, publicSignals: proof.publicSignals })
    : '';

  const [copied, setCopied] = useState(false);
  const copyShareJson = async () => {
    try {
      await navigator.clipboard.writeText(shareJson);
      setCopied(true);
      setToast({ variant: 'success', message: 'Share JSON copied to your clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast({ variant: 'error', message: 'Clipboard access was blocked. Select the JSON and copy manually.' });
    }
  };

  return (
    <div className="app-shell">
      <Navbar />

      <main className="container-page py-8 sm:py-10">
        <header className="mb-8">
          <p className="section-label">Patient workspace</p>
          <h1 className="mt-2">Consent and proof issuance</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-muted">
            Create a consent policy for a provider, then generate a zero-knowledge proof bound to it. The proof
            carries your authorisation — not your records.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── New consent policy ── */}
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control bg-accent-500/12 text-accent-300">
                <FilePlus2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">New consent policy</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Scopes which categories one provider may access, and for how long.
                </p>
              </div>
            </div>

            <form onSubmit={createPolicy} className="mt-6 space-y-4" noValidate>
              <Field label="Provider" htmlFor="providerId" required>
                <select
                  id="providerId"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="control"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Permitted record categories"
                error={consentErrors.categories}
                hint="The provider will only ever be able to prove access to these categories."
              >
                <div className="flex flex-wrap gap-2" role="group" aria-label="Permitted record categories">
                  {CATEGORIES.map((cat) => {
                    const on = categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        aria-pressed={on}
                        className={`rounded-control border px-3 py-1.5 text-sm font-medium transition-colors ${
                          on
                            ? 'border-accent-500 bg-accent-500/12 text-accent-200'
                            : 'border-hairline bg-surface-sunken text-ink-muted hover:border-hairline-strong hover:text-ink'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field
                label="Consent expires"
                htmlFor="validUntil"
                error={consentErrors.validUntil}
                hint="After this date the policy stops authorising access."
                required
              >
                <div className="relative">
                  <input
                    id="validUntil"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="control pr-10"
                  />
                  <CalendarClock
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                    aria-hidden="true"
                  />
                </div>
              </Field>

              <div className="rounded-control border border-hairline bg-surface-sunken px-3 py-2.5 text-[13px] text-ink-muted">
                Access budget: <span className="font-medium text-ink">5 grants</span> under this policy.
              </div>

              <Button type="submit" className="w-full" loading={creating}>
                Create consent policy
              </Button>
            </form>
          </Card>

          {/* ── Existing policies + proof issuance ── */}
          <div className="space-y-6">
            <Card>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control bg-accent-500/12 text-accent-300">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">Your consent policies</h2>
                  <p className="mt-1 text-sm text-ink-muted">Select the policy a proof should be bound to.</p>
                </div>
              </div>

              <div className="mt-5">
                {policiesLoading ? (
                  <ResultPanel state="loading" loadingLabel="Loading your policies…" />
                ) : policiesError ? (
                  <Alert variant="error" title="Could not load policies">
                    <p>{policiesError}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={loadPolicies}>
                      Try again
                    </Button>
                  </Alert>
                ) : policies.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No consent policies yet"
                    description="Create your first policy to authorise a provider to request a proof."
                  />
                ) : (
                  <ul className="space-y-2" role="radiogroup" aria-label="Consent policies">
                    {policies.map((p) => {
                      const selected = p.policyId === selectedPolicyId;
                      return (
                        <li key={p.policyId}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setSelectedPolicyId(p.policyId)}
                            className={`w-full rounded-control border p-3.5 text-left transition-colors ${
                              selected
                                ? 'border-accent-500 bg-accent-500/8'
                                : 'border-hairline bg-surface-sunken hover:border-hairline-strong'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-[13px] text-ink">{p.policyId}</span>
                              <Badge status={p.status} />
                            </div>
                            <p className="mt-1.5 text-sm text-ink-muted">
                              {p.providerId} &middot; {p.allowedCategories.join(', ')}
                            </p>
                            {p.validUntil && (
                              <p className="mt-1 text-[13px] text-ink-faint">
                                Expires {new Date(p.validUntil).toLocaleDateString()}
                                {typeof p.accessCount === 'number' && (
                                  <> &middot; {p.accessCount} of {p.maxAccessCount} grants used</>
                                )}
                              </p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>

            {/* Proof issuance */}
            <Card>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control bg-accent-500/12 text-accent-300">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">Generate access proof</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    Produces a Groth16 proof bound to the selected policy.
                  </p>
                </div>
              </div>

              {/* Bound-to explainer */}
              <div className="mt-5 rounded-control border border-hairline bg-surface-sunken p-3.5">
                {selectedPolicy ? (
                  <>
                    <p className="section-label">This proof will be bound to</p>
                    <p className="mt-1.5 font-mono text-[13px] break-all text-ink">
                      {selectedPolicy.policyId}
                    </p>
                    <p className="mt-1.5 text-[13px] text-ink-muted">
                      For <span className="text-ink">{selectedPolicy.providerId}</span>, covering{' '}
                      <span className="text-ink">{categories.length ? categories.join(', ') : 'no categories selected'}</span>.
                      Single use, valid for one hour.
                    </p>
                    {selectedPolicy.status !== 'ACTIVE' && (
                      <p className="mt-2 text-[13px] text-warning">
                        This policy is {selectedPolicy.status.toLowerCase()}. Select an active policy to generate a proof.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-faint">
                    Select an active consent policy above. A proof must be bound to a policy.
                  </p>
                )}
              </div>

              <Button
                className="mt-4 w-full"
                onClick={generateProof}
                disabled={!canProve}
                loading={generating}
              >
                {generating ? 'Generating proof…' : 'Generate zero-knowledge proof'}
              </Button>
            </Card>
          </div>
        </div>

        {/* ── Generated proof + share ── */}
        <Card className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-semibold text-ink">Proof ready to share</h2>
            {proof && <Badge tone="info">single use</Badge>}
          </div>

          <div className="mt-5">
            {generating ? (
              <ResultPanel state="loading" loadingLabel="Running the circuit and producing a proof…" />
            ) : proofError ? (
              <Alert variant="error" title="Proof generation failed">
                {proofError.message}
                {proofError.code && (
                  <span className="mt-1 block font-mono text-[12px] opacity-80">{proofError.code}</span>
                )}
              </Alert>
            ) : proof ? (
              <div className="space-y-5">
                <Alert variant="success" title="Proof generated">
                  Send the JSON below to your provider. It proves authorisation without revealing any record
                  content, and can be redeemed only once.
                </Alert>

                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Proof ID" value={proof.proofId} mono />
                  <StatCard label="Generated in" value={`${proof.durationMs} ms`} />
                  <StatCard
                    label="Valid until"
                    value={proof.expiresAt ? new Date(proof.expiresAt).toLocaleTimeString() : '—'}
                    hint={proof.expiresAt ? new Date(proof.expiresAt).toLocaleDateString() : undefined}
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="section-label">Share payload</p>
                    <Button size="sm" variant="secondary" onClick={copyShareJson}>
                      {copied ? (
                        <>
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Copy JSON
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="code-block max-h-64 whitespace-pre-wrap break-all">{shareJson}</pre>
                </div>

                <details className="rounded-control border border-hairline bg-surface-sunken px-3.5 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-ink-muted hover:text-ink">
                    Public signals (what the proof asserts)
                  </summary>
                  <p className="mt-2 text-[13px] text-ink-faint">
                    Commitments only — your identity and record contents are not present in these values.
                  </p>
                  <pre className="code-block mt-2.5 max-h-48">
                    {JSON.stringify(proof.publicSignals, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <EmptyState
                icon={FileKey2}
                title="No proof generated yet"
                description="Select an active consent policy and generate a proof. The payload you share with your provider will appear here."
              />
            )}
          </div>
        </Card>
      </main>

      <Toast
        message={toast?.message}
        title={toast?.title}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}
