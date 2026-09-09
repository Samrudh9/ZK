import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Shield, Fingerprint, Activity, CheckCircle2, Copy, FileKey, FilePlus2, ShieldCheck, Loader2 } from 'lucide-react';
import api from '../services/api';

export function PatientDashboard() {
  const [loading, setLoading] = useState(false);
  const [proof, setProof] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedProvider, setSelectedProvider] = useState('drbob');
  const [categories, setCategories] = useState(['Allergy', 'Vaccination']);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });

  const [policies, setPolicies] = useState([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');

  const fetchPolicies = async () => {
    try {
      const res = await api.get('/consent');
      setPolicies(res.data);
      if (res.data.length > 0 && !selectedPolicyId) {
        setSelectedPolicyId(res.data[0].policyId);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load consent policies');
    }
  };

  useEffect(() => {
    fetchPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createPolicy = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/consent', {
        providerId: selectedProvider,
        allowedCategories: categories,
        validFrom: new Date().toISOString(),
        validUntil: new Date(validUntil).toISOString(),
        maxAccessCount: 5
      });
      setSelectedPolicyId(res.data.policyId);
      setSuccess(`Consent policy ${res.data.policyId} ${res.data.status}`);
      await fetchPolicies();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create consent policy');
    } finally {
      setLoading(false);
    }
  };

  const generateProof = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setProof(null);
    try {
      const res = await api.post('/proof/generate', {
        providerId: selectedProvider,
        recordCategories: categories,
        consentPolicyId: selectedPolicyId,
        expiry: new Date(Date.now() + 3600_000).toISOString()
      });
      setProof(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to generate proof');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const shareJson = proof
    ? JSON.stringify({ proofId: proof.proofId, proof: proof.proof, publicSignals: proof.publicSignals })
    : '';

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-6 py-12 animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <Fingerprint className="w-8 h-8 text-cyan-400" />
          <h1 className="text-3xl font-bold">Patient Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Consent Policy Creation + Selection */}
          <Card className="flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <FilePlus2 className="w-6 h-6 text-cyan-400" />
              <h2 className="text-xl font-semibold">Create Consent Policy</h2>
            </div>

            <p className="text-gray-400 text-sm mb-6">
              Define which provider may access which record categories. A proof must be bound to an active consent policy.
            </p>

            <div className="space-y-5 flex-grow">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Select Provider</label>
                <select 
                  className="w-full bg-black/40 border border-panel-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                >
                  <option value="drbob">Dr. Bob (Cardiologist)</option>
                  <option value="drsmith">Dr. Smith (General)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Allowed Categories</label>
                <div className="flex gap-2 flex-wrap">
                  {['Allergy', 'Vaccination', 'Surgery'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        if (categories.includes(cat)) setCategories(categories.filter(c => c !== cat));
                        else setCategories([...categories, cat]);
                      }}
                      className={`px-3 py-1.5 rounded-md text-sm transition-all border ${
                        categories.includes(cat) 
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' 
                          : 'bg-panel border-panel-border text-gray-400 hover:bg-panel-hover'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Valid Until</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full bg-black/40 border border-panel-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  required
                />
              </div>

              <Button 
                className="w-full"
                onClick={createPolicy} 
                disabled={loading || categories.length === 0}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Consent Policy'}
              </Button>
            </div>

            {success && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm break-all">
                {success}
              </div>
            )}
          </Card>

          {/* Existing Policies + Proof Generation */}
          <Card className="flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold">Consent Policies & Proof</h2>
            </div>

            <div className="space-y-5 flex-grow">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Your Consent Policies</label>
                {policies.length === 0 ? (
                  <div className="text-gray-500 text-sm italic border border-dashed border-panel-border rounded-lg py-4 text-center">
                    No consent policies yet. Create one above.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {policies.map(p => (
                      <button
                        key={p.policyId}
                        type="button"
                        onClick={() => setSelectedPolicyId(p.policyId)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedPolicyId === p.policyId
                            ? 'bg-purple-500/10 border-purple-500/50'
                            : 'bg-black/30 border-panel-border hover:bg-black/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-cyan-300 truncate">{p.policyId}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            p.status === 'ACTIVE'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {p.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {p.providerId} · {p.allowedCategories.join(', ')}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-panel-border">
                <label className="block text-sm font-medium text-gray-400 mb-2">Generate Zero-Knowledge Proof</label>
                <p className="text-gray-500 text-xs mb-3">
                  Bound to policy <code className="text-cyan-400">{(selectedPolicyId || '—').slice(0,12)}…</code> for provider {selectedProvider}
                </p>
                <Button 
                  className="w-full" 
                  onClick={generateProof} 
                  disabled={loading || !selectedPolicyId || categories.length === 0}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Generate ZK Proof'}
                </Button>
              </div>
            </div>

            {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
          </Card>
        </div>

        {/* Proof Result Panel */}
        <Card className="mt-8 bg-panel/30 border-dashed border-panel-border/50">
          {proof ? (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-6 text-green-400 bg-green-400/10 p-3 rounded-lg border border-green-400/20">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Proof Generated Successfully</span>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-black/30 border border-panel-border rounded-lg p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Proof ID</div>
                    <div className="font-mono text-cyan-300 text-sm mt-1 break-all">{proof.proofId}</div>
                  </div>
                  <div className="bg-black/30 border border-panel-border rounded-lg p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Generated In</div>
                    <div className="font-mono text-cyan-300 text-sm mt-1">{proof.durationMs} ms</div>
                  </div>
                  <div className="bg-black/30 border border-panel-border rounded-lg p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Expires At</div>
                    <div className="font-mono text-cyan-300 text-sm mt-1">{new Date(proof.expiresAt).toLocaleString()}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Public Signals</label>
                  <div className="bg-black/50 p-3 rounded-lg border border-panel-border font-mono text-xs text-gray-400 h-24 overflow-y-auto">
                    {JSON.stringify(proof.publicSignals, null, 2)}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <Button
                    className="flex-1"
                    onClick={() => copyToClipboard(shareJson)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Share JSON
                  </Button>
                  <p className="text-xs text-gray-500">
                    Send this to the provider to verify. Includes proofId, proof, and publicSignals.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-gray-500 py-12">
              <FileKey className="w-16 h-16 mb-4 opacity-20" />
              <p>Your generated proof will appear here.</p>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
