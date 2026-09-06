import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './styles/global.css';
import { iniciarAnalytics } from './analytics';

/* Antes do render: o gtag registra o primeiro pageview sozinho. */
iniciarAnalytics();

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root nao encontrado no index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
