import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { ShieldCheck, LogOut } from 'lucide-react';

export function Navbar() {
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || 'Unknown';
  const name = localStorage.getItem('username') || 'User';

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <nav className="sticky top-0 z-50 glass-panel !rounded-none border-t-0 border-x-0 border-b border-panel-border px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg border border-cyan-500/30">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
            ZKHealthPass
          </span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex flex-col text-right">
            <span className="text-sm font-medium text-gray-200">{name}</span>
            <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">{role}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-400 hover:text-white">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
