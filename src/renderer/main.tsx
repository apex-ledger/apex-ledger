import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installZeroFriendlyNumbers } from './utils/zeroFriendlyNumbers';

// Number boxes starting at 0: typing replaces the zero instead of adding to it.
installZeroFriendlyNumbers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
