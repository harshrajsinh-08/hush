import { createContext, useContext, useState, useCallback } from 'react';

const AlertContext = createContext();

export function AlertProvider({ children }) {
  const [alert, setAlert] = useState(null); // { message, title, buttonText }

  const showAlert = useCallback((message, title = 'Alert', buttonText = 'OK') => {
    setAlert({ message, title, buttonText });
  }, []);

  const hideAlert = useCallback(() => {
    setAlert(null);
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alert && (
        <AlertModal
          message={alert.message}
          title={alert.title}
          buttonText={alert.buttonText}
          onClose={hideAlert}
        />
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

function AlertModal({ message, title, buttonText, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card alert-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <button className="login-btn" style={{ width: '100%' }} onClick={onClose}>
          {buttonText}
        </button>
      </div>
    </div>
  );
}
