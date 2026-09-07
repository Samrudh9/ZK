import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ShieldCheck, User, Stethoscope, Loader2 } from 'lucide-react';
import api from '../services/api';

export function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('patient');
  const [username, setUsername] = useState('alice'); // default test user
  const [password, setPassword] = useState('alicepw');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Use the actual backend API for auth
      const res = await api.post('/auth/login', { username, password, role });
      
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      localStorage.setItem('username', res.data.username);
      
      if (res.data.role === 'patient') {
        navigate('/patient');
      } else {
        navigate('/provider');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative z-10 animate-fade-in">
      <Card className="w-full max-w-md bg-panel/80">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-2xl border border-cyan-500/30 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
            <ShieldCheck className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold text-gradient">ZKHealthPass</h1>
          <p className="text-gray-400 mt-2 text-sm text-center">Zero-Knowledge Healthcare Identity & Access</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => { setRole('patient'); setUsername('alice'); setPassword('alicepw'); }}
              className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                role === 'patient' 
                  ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                  : 'bg-panel border-panel-border text-gray-400 hover:bg-panel-hover'
              }`}
            >
              <User className="w-6 h-6" />
              <span className="font-medium">Patient</span>
            </button>
            <button
              type="button"
              onClick={() => { setRole('provider'); setUsername('drbob'); setPassword('bobpw'); }}
              className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                role === 'provider' 
                  ? 'bg-purple-500/10 border-purple-500/50 text-purple-300 shadow-[0_0_15px_rgba(139,92,246,0.15)]' 
                  : 'bg-panel border-panel-border text-gray-400 hover:bg-panel-hover'
              }`}
            >
              <Stethoscope className="w-6 h-6" />
              <span className="font-medium">Provider</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black/40 border border-panel-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-panel-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-12 text-lg font-semibold" disabled={loading}>
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Sign In Securely'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
