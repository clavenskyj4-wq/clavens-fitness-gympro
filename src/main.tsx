import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initPWAUpdateListener} from './lib/pwaUpdate';

// Enregistrement du Service Worker PWA + détection automatique des nouvelles versions
initPWAUpdateListener();

createRoot(document.getElementById('root')!).render(<App />);
