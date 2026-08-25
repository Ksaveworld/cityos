import { useLayoutEffect } from 'react'
import { ArrowRight, GitCompareArrows, ScanSearch, Workflow } from 'lucide-react'
import './HomePage.css'

const capabilities = [
  { title: '态势补齐', description: '汇聚事件、建筑与资源信息', Icon: ScanSearch },
  { title: '方案推演', description: '比较不同处置方案的后果', Icon: GitCompareArrows },
  { title: '协同执行', description: '人工确认后生成部门任务', Icon: Workflow },
]

export function HomePage({ onEnter }: { onEnter: () => void }) {
  useLayoutEffect(() => {
    const previousMinWidth = document.body.style.minWidth
    document.body.style.minWidth = '0'
    return () => {
      document.body.style.minWidth = previousMinWidth
    }
  }, [])

  return (
    <main className="cityos-launch" aria-label="CityOS 城市安全开屏页">
      <div className="cityos-launch__wash" aria-hidden="true" />

      <header className="cityos-launch__brand">
        <img
          src="/assets/home/aihuashen-wordmark-v1.png"
          alt="AiHuaShen"
          className="cityos-launch__wordmark"
        />
      </header>

      <section className="cityos-launch__content" aria-labelledby="cityos-launch-title">
        <div className="cityos-launch__copy">
          <div className="cityos-launch__heading">
            <h1 id="cityos-launch-title">CityOS 城市安全</h1>
            <p className="cityos-launch__eyebrow">CITY SAFETY OPERATING SYSTEM</p>
            <span className="cityos-launch__rule" aria-hidden="true" />
          </div>

          <p className="cityos-launch__description">
            接入已知城市事件，补齐态势信息，比较响应方案，
            <br className="cityos-launch__desktop-break" />
            由人工确认后生成协同任务。
          </p>

          <ul className="cityos-launch__capabilities" aria-label="CityOS 核心能力">
            {capabilities.map(({ title, description, Icon }) => (
              <li key={title}>
                <span className="cityos-launch__capability-icon">
                  <Icon size={27} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <strong>{title}</strong>
                <span>{description}</span>
              </li>
            ))}
          </ul>

          <button type="button" onClick={onEnter} className="cityos-launch__cta">
            进入城市安全中心
            <ArrowRight size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

      </section>
    </main>
  )
}
