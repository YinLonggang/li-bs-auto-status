import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ENABLE_MOCKS } from './config';

async function prepareApp() {
  if (ENABLE_MOCKS) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void prepareApp();
