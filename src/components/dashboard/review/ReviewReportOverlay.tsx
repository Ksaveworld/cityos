import { ArrowLeft, Printer, Scale, ShieldAlert, X } from 'lucide-react'

import type { ReviewReport } from './reviewReports'

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section className="report-section">
      <h2><span>{number}</span>{title}</h2>
      {children}
    </section>
  )
}

const STATUS_TONE: Record<string, string> = {
  官方公开: 'report-badge-blue',
  公开报道: 'report-badge-green',
  未公开: 'report-badge-amber',
}

function OutcomeBadge({ outcome, delta }: { outcome: ReviewReport['comparison'][number]['outcome']; delta: string }) {
  if (outcome === 'improved') return <span className="report-badge report-badge-green">CityOS 提升 · {delta}</span>
  if (outcome === 'same') return <span className="report-badge report-badge-blue">共同条件 · {delta}</span>
  if (outcome === 'tradeoff') return <span className="report-badge report-badge-amber">需要权衡 · {delta}</span>
  return <span className="report-badge report-badge-amber">不可比</span>
}

export default function ReviewReportOverlay({
  report,
  onClose,
}: {
  report: ReviewReport
  onClose: () => void
}) {
  const isPublicCase = report.kind === 'public-case'
  const etaDelta = report.baseline.etaMinutes - report.cityos.etaMinutes
  const etaGainLabel = etaDelta > 0 ? `缩短 ${etaDelta.toFixed(1)} 分钟` : etaDelta === 0 ? '与对照持平' : `增加 ${Math.abs(etaDelta).toFixed(1)} 分钟`
  const etaImproved = report.comparison.some((row) => row.metric === '预计首批到场时间' && row.outcome === 'improved')
  const coverageImproved = report.comparison.some((row) => row.metric === '关键资源覆盖风险' && row.outcome === 'improved')
  const hasCityosAdvantage = etaImproved && coverageImproved && etaDelta > 0

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#EEF2F7]" role="dialog" aria-modal="true" aria-label={report.title}>
      <div className="no-print sticky top-0 z-10 flex h-12 items-center justify-between border-b border-[#DDE4EE] bg-white/95 px-4 shadow-sm backdrop-blur">
        <button type="button" onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-label font-semibold text-ink-2 hover:bg-page">
          <ArrowLeft size={14} />返回
        </button>
        <div className="flex items-center gap-2">
          <span className={`report-badge ${isPublicCase ? 'report-badge-blue' : 'report-badge-amber'}`}>
            归档快照 · 不随当前推演更新
          </span>
          <button type="button" onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-label font-semibold text-ink-1 hover:bg-page">
            <Printer size={13} />打印 / 导出 PDF
          </button>
          <button type="button" onClick={onClose} aria-label="关闭复盘报告" className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink-2 hover:bg-page">
            <X size={14} />
          </button>
        </div>
      </div>

      <main id="cityos-report" data-review-report-id={report.id} className="report-document mx-auto my-5 w-[1120px] rounded-[14px] bg-white px-10 py-8 shadow-[0_16px_50px_rgb(35_48_73_/_0.14)]">
        <header className="report-header">
          <div className="report-kicker">CITY OS · 城市应急协同 · 复盘报告</div>
          <h1>{report.title}</h1>
          <p style={{ color: report.domainColor }}>{report.domain}</p>
          <div className="report-meta">
            <span>报告编号 {report.reportNo}</span><i />
            <span>统一演示条件编号 {report.assumptionSetId}</span><i />
            <span>演示模型版本 {report.modelVersion}</span><i />
            <span>生成时间 {report.generatedAt}</span>
          </div>
          <div style={{ marginTop: 8, color: '#946114', fontSize: 10 }}>
            本报告是知识沉淀时的版本化快照；如需当前方案指标，请回到事件处置打开即时报告。
          </div>
        </header>

        {/* 报告开头就把「这份东西能证明什么、不能证明什么」说清楚，
            不放到脚注里——放脚注等于没说。 */}
        <div className="report-alert">
          <div className="report-alert-icon"><Scale size={18} /></div>
          <div>
            <strong>{hasCityosAdvantage ? '结论：同条件演示下，CityOS 协同处置更优' : '结论：当前演示结果需要人工权衡'}</strong>
            <p>{hasCityosAdvantage ? `预计首批到场时间${etaGainLabel}，关键资源覆盖风险从“${report.baseline.coverageRisk}”降至“${report.cityos.coverageRisk}”。` : ''}{report.subtitle}</p>
          </div>
          <div
            className="report-metrics"
            data-cityos-advantage-summary={hasCityosAdvantage ? 'true' : 'false'}
            data-baseline-eta={report.baseline.etaMinutes}
            data-cityos-eta={report.cityos.etaMinutes}
            data-eta-improvement={etaDelta.toFixed(1)}
          >
            <b style={{ color: '#697386' }}>{report.baseline.etaMinutes.toFixed(1)} 分钟</b><span>常规处置预计到场 · 演示</span>
            <b>{report.cityos.etaMinutes.toFixed(1)} 分钟</b><span>CityOS 预计到场 · 演示</span>
            <b>{etaGainLabel}</b><span>CityOS 带来的演示提升</span>
            <b>{report.baseline.coverageRisk} → {report.cityos.coverageRisk}</b><span>资源覆盖风险变化</span>
          </div>
        </div>

        <Section number="1" title={isPublicCase ? '公开事实与来源' : '演示事件前提'}>
          {isPublicCase ? (
            <table>
              <thead><tr><th>信息类别</th><th>内容</th><th>来源</th><th>公开程度</th><th>使用边界</th></tr></thead>
              <tbody>
                {report.facts.map((fact) => (
                  <tr key={fact.label}>
                    <td>{fact.label}</td>
                    <td><strong>{fact.value}</strong></td>
                    <td>{fact.source.title}</td>
                    <td><span className={`report-badge ${STATUS_TONE[fact.status] ?? 'report-badge-blue'}`}>{fact.status}</span></td>
                    <td>{fact.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="report-summary-grid">
              <div>
                <span>事件前提</span>
                <strong>{report.simulatedPremise}</strong>
              </div>
              <div>
                <span>公开事实</span>
                <strong>无。本场景不对应任何真实事件，因此没有可引用的公开事实。</strong>
              </div>
            </div>
          )}
        </Section>

        <div data-cityos-comparison data-scope="same-conditions-simulation">
        <Section number="2" title="常规处置与 CityOS 协同处置">
          <table aria-label="常规处置与 CityOS 协同处置对比">
            <thead><tr><th>方案</th><th>预计首批到场</th><th>关键资源覆盖风险</th><th>方案怎么形成</th></tr></thead>
            <tbody>
              <tr data-comparison-track="baseline" style={{ background: '#FAFBFC', color: '#697386' }}>
                <td><strong>{report.baseline.title}</strong><span className="report-badge" style={{ marginLeft: 7, background: '#ECEEF2', color: '#697386' }}>参照</span></td>
                <td>{report.baseline.etaMinutes.toFixed(1)} 分钟</td>
                <td>{report.baseline.coverageRisk}</td>
                <td>{report.baseline.note}</td>
              </tr>
              <tr data-comparison-track="cityos" style={{ background: '#F5F5FF', boxShadow: 'inset 4px 0 #5B5BD6' }}>
                <td><strong style={{ color: '#4B4BC4' }}>{report.cityos.title}</strong><span className="report-badge report-badge-blue" style={{ marginLeft: 7 }}>{hasCityosAdvantage ? '推荐 · 演示' : '候选 · 演示'}</span></td>
                <td><strong style={{ color: '#4B4BC4' }}>{report.cityos.etaMinutes.toFixed(1)} 分钟</strong></td>
                <td><strong style={{ color: '#4B4BC4' }}>{report.cityos.coverageRisk}</strong></td>
                <td>{report.cityos.note}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', color: '#75829a', fontSize: 11 }}>
            地理快照：{report.mapSnapshot}
          </p>
        </Section>

        <Section number="3" title="CityOS 带来的变化">
          <table aria-label="CityOS 带来的变化">
            <thead><tr><th>比较项</th><th>常规处置</th><th style={{ background: '#EEEEFB', color: '#4B4BC4' }}>CityOS 协同处置</th><th>CityOS 带来的提升</th><th>为什么会变化</th></tr></thead>
            <tbody>
              {report.comparison.map((row) => (
                <tr key={row.metric} data-comparison-outcome={row.outcome}>
                  <td>{row.metric}</td>
                  <td>{row.baseline}</td>
                  <td style={{ background: '#FAFAFF', color: row.outcome === 'improved' ? '#4B4BC4' : undefined }}>{row.outcome === 'improved' ? <strong>{row.cityos}</strong> : row.cityos}</td>
                  <td><OutcomeBadge outcome={row.outcome} delta={row.delta} /></td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        </div>

        {/* 这一节是整份报告最要紧的部分，不能折叠也不能省略 */}
        <Section number="4" title="哪些结果不能这样理解">
          <div className="report-alert" style={{ marginTop: 0, borderColor: '#EBC8A0', background: '#FFF8EE' }}>
            <div className="report-alert-icon" style={{ background: '#C1801E' }}><ShieldAlert size={18} /></div>
            <div>
              <strong>以下真实结果没有公开对照数据，不能拿演示结果评价当年实际处置</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#7A5A20', lineHeight: 1.7 }}>
                {report.incomparable.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </Section>

        <Section number="5" title="CityOS 可复用的经验">
          <table>
            <thead><tr><th>可复用内容</th><th>本次沉淀</th><th>下次怎么用</th></tr></thead>
            <tbody>
              {report.deposits.map((item) => (
                <tr key={item.label}>
                  <td>{item.label}</td>
                  <td><strong>{item.value}</strong></td>
                  <td>{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', color: '#75829a', fontSize: 11 }}>
            演示草稿 · 未写入生产知识库。当前没有后端，沉淀内容只存在于本次演示中。
          </p>
        </Section>

        <Section number="6" title="数据来源与演示边界">
          <table>
            <thead><tr><th>来源</th><th>链接</th></tr></thead>
            <tbody>
              {report.sources.map((source) => (
                <tr key={source.title}>
                  <td>{source.title}</td>
                  <td>{source.href === '#' ? '内部演示模型，无外部链接' : source.href}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="report-provenance">
            事件流、资源状态、车辆编成、ETA、任务与签收均为演示或估算，不接真实后台，也不会下发真实指令。
            底图、路网与设施位置来自公开 OSM 数据。
          </div>
        </Section>

        <div className="report-signoff">
          <div>
            <span>复盘负责人</span>
            <strong>演示环境 · 未指派</strong>
          </div>
          <div>
            <span>报告性质</span>
            <strong>{isPublicCase ? '公开事件复盘（事实与演示分栏）' : '演示推演复盘（全场景演示）'}</strong>
          </div>
        </div>
      </main>
    </div>
  )
}
