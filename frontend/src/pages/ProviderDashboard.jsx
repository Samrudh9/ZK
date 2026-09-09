import React, { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Search, ShieldAlert, ShieldCheck, Activity, Stethoscope, Loader2 } from 'lucide-react';
import api from '../services/api';

const EXAMPLE_JSON = `{
  "proofId": "prf_a1b2c3d4...",
  "proof": { "pi_a": ["..."], "pi_b": [["..."],["..."]], "pi_c": ["..."], "protocol": "groth16" },
  "publicSignals": ["1", "..."]
}`;

export function ProviderDashboard() {
  const [pastedJson, setPastedJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState(null);

  const verifyProof = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setVerificationResult(null);

    let data;
    try {
      data = JSON.parse(pastedJson);
    } catch (err) {
      setError({ code: 'INVALID_JSON', message: 'Invalid JSON. Please paste the proof JSON exactly as copied from the patient dashboard.' });
      setLoading(false);
      return;
    }

    try {
      const res = await api.post('/proof/verify', data);
      setVerificationResult(res.data);
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (apiError) {
        setError(apiError);
      } else {
        setError({ code: 'UNKNOWN', message: 'Verification failed. Invalid or expired proof.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const renderError = () => {
    if (!error) return null;
    let title = 'Verification Failed';
    let detail = error.message;

    if (error.code === 'PROOF_REPLAYED') {
      title = 'Proof Already Used';
      detail = 'This proof was already used — replay blocked. (409)';
    } else if (error.code === 'INVALID_PROOF') {
      title = 'Invalid Proof';
      detail = 'The proof could not be verified.';
    } else if (error.code === 'PROOF_EXPIRED') {
      title = 'Proof Expired';
      detail = 'The proof\'s expiry has passed.';
    } else if (error.code === 'POLICY_INACTIVE') {
      title = 'Consent Policy Inactive';
      detail = 'The bound consent policy is expired, revoked, or exhausted.';
    } else if (error.code === 'INVALID_JSON') {
      title = 'Invalid JSON';
    }

    return (
      <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg animate-fade-in">
        <div className="flex items-start gap-3 text-red-400">
          <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm mt-1">{detail}</p>
            <p className="text-xs mt-2 text-red-400/70 font-mono">code: {error.code} · status: {error.statusCode}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-6 py-12 animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <Stethoscope className="w-8 h-8 text-purple-400" />
          <h1 className="text-3xl font-bold">Provider Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Verification Panel */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <div className="flex items-center gap-2 mb-6">
                <Search className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">Verify Patient Proof</h2>
              </div>
              
              <form onSubmit={verifyProof} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Paste the proof JSON from the patient</label>
                  <textarea
                    rows={8}
                    placeholder={EXAMPLE_JSON}
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    className="w-full bg-black/40 border border-panel-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono text-xs resize-y"
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading || !pastedJson.trim()}>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Cryptographic Proof'}
                </Button>
              </form>

              <button
                type="button"
                onClick={() => setPastedJson(EXAMPLE_JSON)}
                className="mt-2 text-xs text-cyan-400/70 hover:text-cyan-300"
              >
                Paste example JSON
              </button>
              
              {renderError()}
            </Card>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2">
            <Card className="h-full min-h-[400px] flex flex-col">
              {verificationResult ? (
                <div className="animate-fade-in h-full flex flex-col">
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-panel-border">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/20 rounded-full">
                        <ShieldCheck className="w-6 h-6 text-green-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-green-400">ACCESS GRANTED</h2>
                        <p className="text-sm text-gray-400">
                          valid: {String(verificationResult.valid)} · accessGranted: {String(verificationResult.accessGranted)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">Transaction</div>
                      <div className="font-mono text-cyan-300 bg-cyan-500/10 px-3 py-1 rounded border border-cyan-500/20 mt-1">
                        {verificationResult.txId}
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Authorized Categories</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
                    {(verificationResult.authorizedCategories || []).map((category) => (
                      <div key={category} className="bg-black/30 border border-panel-border rounded-lg p-4 hover:bg-black/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-purple-400" />
                          <h4 className="font-medium text-gray-200">{category}</h4>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {(verificationResult.authorizedCategories || []).length === 0 && (
                    <div className="flex-grow flex items-center justify-center text-gray-500 italic border border-dashed border-panel-border rounded-lg bg-black/20">
                      No categories authorized by this proof.
                    </div>
                  )}

                  <div className="mt-6 pt-4 border-t border-panel-border flex items-center justify-between text-xs text-gray-400">
                    <span>
                      Audit Ref: <span className="font-mono text-cyan-400">{verificationResult.auditRef}</span>
                    </span>
                    <span>
                      Proof ID: <span className="font-mono text-cyan-400">{verificationResult.proofId || '—'}</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center text-gray-500 opacity-50">
                  <ShieldCheck className="w-20 h-20 mb-6 text-gray-600" />
                  <h3 className="text-lg font-medium text-gray-400">Awaiting Verification</h3>
                  <p className="text-sm mt-2 max-w-sm text-center">Paste the proof JSON from the patient on the left to cryptographically verify access without exposing underlying EHRs.</p>
                </div>
              )}
            </Card>
          </div>
          
        </div>
      </main>
    </div>
  );
}
