import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import appConfig from '../app-config.json';
import '@aws-amplify/ui-react/styles.css';
import './index.css';
import App from './App';

Amplify.configure(appConfig);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
