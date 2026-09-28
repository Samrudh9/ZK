import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, HeartPulse } from 'lucide-react';
import { Button, Badge } from '../ui';

export function Navbar() {
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || 'unknown';
  const name = localStorage.getItem('username') || 'User';

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control bg-accent-500/12 text-accent-300">
            <HeartPulse className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate font-display text-[17px] font-bold tracking-tight text-ink">
            ZKHealthPass
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-ink">{name}</p>
          </div>
          <Badge tone={role === 'patient' ? 'info' : 'neutral'}>{role}</Badge>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
