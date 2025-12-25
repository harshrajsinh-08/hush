import React from 'react';

const Maintenance = () => {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-gradient)',
      color: 'var(--slate-900)',
      fontFamily: "'Outfit', sans-serif",
      textAlign: 'center',
      padding: '2rem'
    }}>
      <div style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        padding: '3rem',
        borderRadius: '30px',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow-lg)',
        maxWidth: '500px',
        animation: 'fadeIn 0.8s ease-out'
      }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '1.5rem',
          animation: 'float 3s ease-in-out infinite'
        }}>
          🛠️
        </div>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '700',
          marginBottom: '1rem',
          color: 'var(--primary)',
          letterSpacing: '-0.02em'
        }}>
          Under Maintenance
        </h1>
        <p style={{
          fontSize: '1.1rem',
          color: 'var(--slate-600)',
          lineHeight: '1.6',
          marginBottom: '2rem'
        }}>
          We're currently performing some essential updates to make <strong>HUSH</strong> even better. We'll be back online shortly!
        </p>
        <div style={{
          height: '4px',
          width: '60px',
          background: 'var(--primary)',
          borderRadius: '2px',
          margin: '0 auto',
          opacity: '0.3'
        }}></div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default Maintenance;
