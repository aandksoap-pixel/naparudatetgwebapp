import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initTelegram } from './lib/telegram';

initTelegram();

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(<App />);
}
