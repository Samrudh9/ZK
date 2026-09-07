import React, { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Search, ShieldAlert, ShieldCheck, Activity, Stethoscope } from 'lucide-react';
import api from '../services/api';

export function ProviderDashboard() {
  const [proofId, setProofId] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState('');

  const verifyProof = async (e) => {
    e.preventDefault();
    if (!proofId.trim()) return;
    
    setLoading(true);
    setError('');
    setVerificationResult(null);

    try {
      const res = await api.post('/proof/verify', { proofId });
      setVerificationResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Invalid or expired proof.');
    } finally {
      setLoading(false);
    }
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
                  <label className="block text-sm font-medium text-gray-400 mb-2">Enter Proof ID</label>
                  <input
                    type="text"
                    placeholder="e.g. proof_1234567890"
                    value={proofId}
                    onChange={(e) => setProofId(e.target.value)}
                    className="w-full bg-black/40 border border-panel-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono text-sm"
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading || !proofId}>
                  {loading ? 'Verifying...' : 'Verify Cryptographic Proof'}
                </Button>
              </form>
              
              {error && (
                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400 animate-fade-in">
                  <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
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
                        <h2 className="text-xl font-bold text-white">Proof Verified Successfully</h2>
                        <p className="text-sm text-green-400">Zero-Knowledge signature is valid</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">Patient Identity</div>
                      <div className="font-mono text-cyan-300 bg-cyan-500/10 px-3 py-1 rounded border border-cyan-500/20 mt-1">
                        {verificationResult.patientId}
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Authorized Medical Data</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
                    {Object.entries(verificationResult.data || {}).map(([category, value]) => (
                      <div key={category} className="bg-black/30 border border-panel-border rounded-lg p-4 hover:bg-black/50 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-purple-400" />
                          <h4 className="font-medium text-gray-200 capitalize">{category}</h4>
                        </div>
                        <p className="text-sm text-gray-400">{value}</p>
                      </div>
                    ))}
                  </div>
                  
                  {Object.keys(verificationResult.data || {}).length === 0 && (
                    <div className="flex-grow flex items-center justify-center text-gray-500 italic border border-dashed border-panel-border rounded-lg bg-black/20">
                      No medical data revealed in this proof.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center text-gray-500 opacity-50">
                  <ShieldCheck className="w-20 h-20 mb-6 text-gray-600" />
                  <h3 className="text-lg font-medium text-gray-400">Awaiting Verification</h3>
                  <p className="text-sm mt-2 max-w-sm text-center">Enter a Proof ID on the left to cryptographically verify patient data without exposing underlying EHRs.</p>
                </div>
              )}
            </Card>
          </div>
          
        </div>
      </main>
    </div>
  );
}
