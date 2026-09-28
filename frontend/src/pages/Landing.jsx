import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartPulse,
  ShieldCheck,
  FileCheck2,
  Ban,
  ArrowRight,
  Fingerprint,
  ScrollText,
} from 'lucide-react';
import { Button } from '../components/ui';

const PILLARS = [
  {
    icon: Fingerprint,
    title: 'Proof, not disclosure',
    body: 'A Groth16 proof shows a patient satisfies a consent policy without revealing the patient identity or any clinical record content. The provider learns authorisation, not data.',
  },
  {
    icon: FileCheck2,
    title: 'Patient-authored consent',
    body: 'Each policy names one provider, the permitted record categories, a validity window, and an access budget. The patient creates it; nobody can widen it later.',
  },
  {
    icon: Ban,
    title: 'Replay protection',
    body: 'Every proof is single-use. The ledger records redemption, so a captured proof cannot be presented a second time to gain another look at the same records.',
  },
  {
    icon: ScrollText,
    title: 'Immutable audit trail',
    body: 'Consent changes and every granted access are written to a tamper-evident ledger, giving patients and providers a record they can both inspect.',
  },
];

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="border-b border-hairline">
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-accent-500/12 text-accent-300">
              <HeartPulse className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-display text-[17px] font-bold tracking-tight text-ink">ZKHealthPass</span>
          </div>
          <Button onClick={() => navigate('/login')}>
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="container-page grid gap-10 py-section lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <p className="section-label">Zero-knowledge EHR access control</p>
            <h1 className="mt-4 text-4xl leading-[1.12] sm:text-5xl">
              Consent that proves itself
              <span className="block text-accent-300">without opening the chart</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted">
              A patient authorises a clinician to see specific record categories. The clinician receives a
              cryptographic proof that the authorisation is genuine — not the underlying medical data, and not
              necessarily the patient&rsquo;s identity. Every access is recorded immutably.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate('/login')}>
                Access the portal
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-ink-muted hover:text-ink transition-colors"
              >
                How it works
              </a>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-hairline pt-6">
              {[
                { k: 'Proof generation', v: '~1 s' },
                { k: 'Proof verification', v: '~25 ms' },
                { k: 'Underlying data shared', v: 'None' },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                    {s.k}
                  </dt>
                  <dd className="mt-1 font-display text-lg font-semibold text-ink">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Explainer card */}
          <div className="surface-raised p-6">
            <h2 className="font-display text-base font-semibold text-ink">
              The exchange, end to end
            </h2>
            <ol className="mt-5 space-y-5">
              {[
                {
                  t: 'Patient creates a consent policy',
                  d: 'Provider, permitted categories, expiry, and how many times access may be granted.',
                },
                {
                  t: 'Patient generates a zero-knowledge proof',
                  d: 'Bound to that policy. Generation runs locally against the circuit; nothing is uploaded but the proof.',
                },
                {
                  t: 'Provider verifies the proof',
                  d: 'The server checks the proof cryptographically, then the ledger enforces single-use, policy status, and remaining access.',
                },
                {
                  t: 'Access is recorded',
                  d: 'An immutable audit event links the transaction, the proof, and the categories actually authorised.',
                },
              ].map((step, i) => (
                <li key={step.t} className="flex gap-4">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-accent-500/30 bg-accent-500/10 font-mono text-[13px] text-accent-300">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{step.t}</p>
                    <p className="mt-1 text-sm text-ink-muted">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pillars */}
        <section id="how-it-works" className="border-t border-hairline bg-surface-sunken">
          <div className="container-page py-section">
            <h2 className="font-display text-2xl font-semibold text-ink">
              What the design guarantees
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-muted">
              Four properties that separate this from ordinary record sharing.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {PILLARS.map(({ icon: Icon, title, body }) => (
                <article key={title} className="surface p-5">
                  <Icon className="h-5 w-5 text-accent-300" aria-hidden="true" />
                  <h3 className="mt-3.5 font-display text-base font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container-page py-section">
          <div className="surface-raised flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">
                Have a consent policy to verify, or need to issue one?
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Sign in to open the patient or provider workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate('/login')}>
                Patient workspace
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>
                Provider workspace
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="container-page flex flex-col gap-2 py-6 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            ZKHealthPass — privacy-preserving electronic health record access
          </p>
          <p>Not for clinical decision-making. Demonstration environment.</p>
        </div>
      </footer>
    </div>
  );
}
