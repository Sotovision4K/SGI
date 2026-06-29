import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Capture PKCE state BEFORE oidc-client-ts removes it, AND intercept token request
const url = window.location.href
if (url.includes('?code=') || url.includes('&code=')) {
  console.log('[localStorage] Before callback processing')
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    const val = localStorage.getItem(key)!;
    console.log(`[localStorage] RAW ${key}:`, val);
  }
  // Also intercept fetch to log the token request body
  const origFetch = window.fetch
  window.fetch = function(...args) {
    const [reqUrl, reqOpts] = args
    if (typeof reqUrl === 'string' && reqUrl.includes('/oauth2/token')) {
      console.log('[fetch] TOKEN REQUEST URL:', reqUrl)
      console.log('[fetch] TOKEN REQUEST BODY:', reqOpts?.body)
    }
    return origFetch.apply(this, args)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>

      <App />
    </BrowserRouter>
    
  </StrictMode>,
)