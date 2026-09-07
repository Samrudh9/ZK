import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { PatientDashboard } from './pages/PatientDashboard';
import { ProviderDashboard } from './pages/ProviderDashboard';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) return <Navigate to="/login" replace />;
  if (allowedRole && role !== allowedRole) {
    return <Navigate to={role === 'patient' ? '/patient' : '/provider'} replace />;
  }

  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-blob"></div>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/patient/*" element={
          <ProtectedRoute allowedRole="patient">
            <PatientDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/provider/*" element={
          <ProtectedRoute allowedRole="provider">
            <ProviderDashboard />
          </ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
