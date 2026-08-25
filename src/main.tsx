import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 自检页只在 DEV 下挂载，生产构建里这段被 tree-shake 掉
const SelfTest = import.meta.env.DEV ? lazy(() => import('./pages/SelfTest.tsx')) : null

function Root() {
  if (SelfTest && window.location.hash.startsWith('#/selftest')) {
    return (
      <Suspense fallback={null}>
        <SelfTest />
      </Suspense>
    )
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
