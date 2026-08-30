import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 自检页只在 DEV 下挂载，生产构建里这段被 tree-shake 掉
const SelfTest = import.meta.env.DEV ? lazy(() => import('./pages/SelfTest.tsx')) : null

// 阶段 0 验证页。**生产构建里也挂**——它要拿给产品和视觉侧当面判「那半秒有没有
// 力量」，只能在本机开发服务器上看会拖慢这个判断。懒加载，不进主导航，
// 结论出来后连同 src/phase0/ 一起删或升级。
const CoverageProbe = lazy(() => import('./phase0/CoverageProbe.tsx'))

function Root() {
  if (SelfTest && window.location.hash.startsWith('#/selftest')) {
    return (
      <Suspense fallback={null}>
        <SelfTest />
      </Suspense>
    )
  }
  if (window.location.hash.startsWith('#/phase0')) {
    return (
      <Suspense fallback={null}>
        <CoverageProbe />
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
