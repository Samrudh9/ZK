import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Shield, Fingerprint, Activity, CheckCircle2, Copy, FileKey } from 'lucide-react';
import api from '../services/api';

export function PatientDashboard() {
  const [loading, setLoading] = useState(false);
  const [proof, setProof] = useState(null);
  const [error, setError] = useState('');
  
  const [selectedProvider, setSelectedProvider] = useState('drbob');
  const [categories, setCategories] = useState(['Allergy', 'Vaccination']);

  const generateProof = async () => {
    setLoading(true);
    setError('');
    setProof(null);
    try {
      const res = await api.post('/proof/generate', {
        providerId: selectedProvider,
        categories: categories
      });
      setProof(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate proof');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-6 py-12 animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <Fingerprint className="w-8 h-8 text-cyan-400" />
          <h1 className="text-3xl font-bold">Patient Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Proof Generation Panel */}
          <Card className="flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold">Generate Zero-Knowledge Proof</h2>
            </div>
            
            <p className="text-gray-400 text-sm mb-6">
              Generate a cryptographic proof that you meet the provider's criteria without revealing your underlying medical data.
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
                <label className="block text-sm font-medium text-gray-400 mb-2">Requested Categories</label>
                <div className="flex gap-2">
                  {['Allergy', 'Vaccination', 'Surgery'].map(cat => (
                    <button
                      key={cat}
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
            </div>

            {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

            <Button 
              className="w-full mt-8" 
              onClick={generateProof} 
              disabled={loading || categories.length === 0}
            >
              {loading ? 'Generating Proof...' : 'Generate ZK Proof'}
            </Button>
          </Card>

          {/* Results Panel */}
          <Card className="flex flex-col bg-panel/30 border-dashed border-panel-border/50">
            {proof ? (
              <div className="animate-fade-in flex flex-col h-full">
                <div className="flex items-center gap-2 mb-6 text-green-400 bg-green-400/10 p-3 rounded-lg border border-green-400/20">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Proof Generated Successfully</span>
                </div>
                
                <div className="space-y-4 flex-grow">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Proof ID (Share with Provider)</label>
                    <div className="flex items-center gap-2 bg-black/50 p-3 rounded-lg border border-panel-border font-mono text-cyan-300">
                      <span className="flex-grow truncate">{proof.proofId}</span>
                      <button onClick={() => copyToClipboard(proof.proofId)} className="text-gray-400 hover:text-white p-1">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">ZK Proof Data (Encrypted Payload)</label>
                    <div className="bg-black/50 p-3 rounded-lg border border-panel-border font-mono text-xs text-gray-400 h-40 overflow-y-auto">
                      {JSON.stringify(proof.zkProof, null, 2)}
                    </div>
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
          
        </div>
      </main>
    </div>
  );
}
