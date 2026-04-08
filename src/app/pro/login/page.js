'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import './login.css';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function ProLoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (hasClerkKeys) {
      router.replace('/sign-in?redirect_url=/pro/dashboard');
    }
  }, [router]);

  if (hasClerkKeys) {
    return <main style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--muted)' }}>Redirigiendo al inicio de sesión...</main>;
  }

  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Admin check
    if (email === 'Admin' && password === 'ADMIN') {
      router.push('/pro/dashboard');
    } else if (activeTab === 'login') {
      alert('Credenciales incorrectas. Prueba con Admin / ADMIN para el MVP.');
    } else {
      // Simulation for register
      router.push('/pro/dashboard');
    }
  };

  return (
    <>
      <Header />
      <main className="pro-login-page">
        <div className="pro-login-card">
          <div className="pro-login-header">
            <h1 className="pro-login-title">Med<span>Connect</span> Pro</h1>
            <p className="pro-login-subtitle">Portal exclusivo para profesionales médicos</p>
          </div>
          
          <div className="pro-login-body">
            <div className="pro-login-tabs">
              <div 
                className={`pro-login-tab ${activeTab === 'login' ? 'active' : ''}`}
                onClick={() => setActiveTab('login')}
              >
                Iniciar Sesión
              </div>
              <div 
                className={`pro-login-tab ${activeTab === 'register' ? 'active' : ''}`}
                onClick={() => setActiveTab('register')}
              >
                Crear Cuenta
              </div>
            </div>

            <form onSubmit={handleSubmit} className="form-group" style={{ gap: '1rem' }}>
              {activeTab === 'register' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="clinicName">Nombre Completo / Clínica</label>
                    <input type="text" id="clinicName" className="form-input" placeholder="Ej. Dr. Juan Pérez" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="medicId">Núm. Colegiado / Registro Sanitario</label>
                    <input type="text" id="medicId" className="form-input" placeholder="Opcional por ahora" />
                  </div>
                </>
              )}
              
              <div className="form-group">
                <label className="form-label" htmlFor="email">Usuario / Email</label>
                <input 
                  type="text" 
                  id="email" 
                  className="form-input" 
                  placeholder="Admin" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="password">Contraseña</label>
                <input 
                  type="password" 
                  id="password" 
                  className="form-input" 
                  placeholder="ADMIN" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
              </div>

              {activeTab === 'login' && (
                <a href="#" className="pro-login-forgot">¿Olvidaste tu contraseña?</a>
              )}

              <button type="submit" className="btn btn-navy" id="pro-login-btn" style={{ width: '100%', marginTop: '0.5rem', padding: '1rem' }}>
                {activeTab === 'login' ? 'Entrar al Dashboard' : 'Registrarme'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
