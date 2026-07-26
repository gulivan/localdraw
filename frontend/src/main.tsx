import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@excalidraw/excalidraw/index.css'
import './index.css'
import '@fontsource-variable/dm-sans'
import App from './App.tsx'
import { configureDisplayFont } from './utils/displayFont'

configureDisplayFont()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
