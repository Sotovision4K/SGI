import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Dump BOTH storages BEFORE oidc-client-ts processes callback
// PKCE verifier is now in localStorage, not sessionStorage
const url = window.location.href
if (url.includes('?code=') || url.includes('&code=')) {
  console.log('[localStorage] Before callback processing, URL has code param')
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    const val = localStorage.getItem(key)!;
    console.log(`[localStorage] ${key} = ${val.substring(0, 200)}`);
  }
  console.log('[localStorage] Total keys:', localStorage.length);
  console.log('[sessionStorage] Total keys:', sessionStorage.length);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>

      <App />
    </BrowserRouter>
    
  </StrictMode>,
)