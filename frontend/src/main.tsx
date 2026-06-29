import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Dump sessionStorage on page load BEFORE oidc-client-ts processes callback
// This captures PKCE state if it was stored before the Cognito redirect
const url = window.location.href
if (url.includes('?code=') || url.includes('&code=')) {
  console.log('[sessionStorage] Before callback processing, URL has code param')
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)!;
    const val = sessionStorage.getItem(key)!;
    console.log(`[sessionStorage] ${key} = ${val.substring(0, 200)}`);
  }
  console.log('[sessionStorage] Total keys:', sessionStorage.length);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>

      <App />
    </BrowserRouter>
    
  </StrictMode>,
)