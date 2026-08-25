const BLOCK = 'rounded-md bg-[#E9EBF2]'

/** 与总览保持同一几何结构的只读加载骨架，避免地图初始化前页面跳版。 */
export function CityOverviewLoading() {
  return (
    <main
      data-city-overview-loading
      className="grid h-svh min-w-[1180px] grid-rows-[46px_auto_minmax(0,1fr)_140px] gap-2.5 overflow-hidden bg-page p-2.5 text-ink-1"
      aria-busy="true"
      aria-label="城市态势总览正在载入"
    >
      <header className="flex h-[46px] items-center gap-3 rounded-xl border border-line bg-surface-card px-3 shadow-panel">
        <span className="grid size-7 place-items-center rounded-lg bg-ink-1 font-mono text-label font-bold tracking-[-0.08em] text-white">CO</span>
        <span className="leading-none">
          <span className="block text-title tracking-[-0.03em] text-ink-1">CITY OS</span>
          <span className="mt-1 block text-footnote tracking-[0.08em] text-ink-3">城市应急协同</span>
        </span>
        <span className="rounded-md border border-[#F2CBCD] bg-[#FDF0F0] px-1.5 py-1 text-label font-semibold tracking-[0.06em] text-[#A3373C]">
          DEMO · 非生产 · 含演示数据
        </span>
        <div className="ml-3 flex gap-2" aria-hidden="true">
          <span className={`${BLOCK} h-7 w-20`} />
          <span className={`${BLOCK} h-7 w-20`} />
          <span className={`${BLOCK} h-7 w-20`} />
          <span className={`${BLOCK} h-7 w-24`} />
        </div>
        <span className={`${BLOCK} ml-auto h-7 w-56`} aria-hidden="true" />
      </header>

      <section className="flex items-stretch gap-3 rounded-xl border border-line bg-surface-card px-3.5 py-2.5 shadow-panel" aria-hidden="true">
        <div className="flex w-[132px] shrink-0 flex-col justify-center gap-2 border-r border-hairline pr-3">
          <span className={`${BLOCK} h-4 w-20`} />
          <span className={`${BLOCK} h-2.5 w-24`} />
          <span className={`${BLOCK} h-4 w-16`} />
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-lg bg-sunken px-3 py-2">
              <span className={`${BLOCK} block h-3 w-20`} />
              <div className="mt-2 flex items-end justify-between">
                <span className={`${BLOCK} h-7 w-14`} />
                <span className={`${BLOCK} h-4 w-16`} />
              </div>
              <span className={`${BLOCK} mt-2 block h-2.5 w-24`} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid min-h-0 grid-cols-[264px_minmax(0,1fr)] gap-2.5" aria-hidden="true">
        <aside className="flex min-h-0 flex-col gap-2">
          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-surface-card p-2.5 shadow-panel">
            <span className={`${BLOCK} mb-2 h-3 w-24`} />
            <div className="grid min-h-0 flex-1 grid-rows-5 gap-1.5">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex items-center gap-2 rounded-md px-1">
                  <span className={`${BLOCK} h-4 w-8`} />
                  <span className={`${BLOCK} h-3 w-12`} />
                  <span className={`${BLOCK} ml-auto h-3 w-20`} />
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-2 border-t border-hairline pt-2">
              <span className={`${BLOCK} block h-3 w-full`} />
              <span className={`${BLOCK} block h-3 w-4/5`} />
            </div>
          </section>
          <section className="grid h-[72px] shrink-0 grid-cols-4 gap-1 rounded-xl border border-line bg-surface-card p-2 shadow-panel">
            {Array.from({ length: 4 }, (_, index) => <span key={index} className={`${BLOCK} h-9`} />)}
          </section>
        </aside>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-panel">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
            <span className={`${BLOCK} h-3 w-28`} />
            <span className={`${BLOCK} h-3 w-48`} />
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#EEF0F6]">
            <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(#E1E4ED_1px,transparent_1px),linear-gradient(90deg,#E1E4ED_1px,transparent_1px)] [background-size:40px_40px]" />
            <div className="absolute inset-0 grid place-items-center">
              <span className="rounded-full border border-line bg-white/90 px-3 py-1.5 text-[11px] text-ink-3">载入站点数据并构建路网</span>
            </div>
          </div>
        </section>
      </div>

      <section className="grid min-h-0 grid-cols-[1.05fr_1.35fr_0.9fr] gap-2.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex min-h-0 flex-col rounded-xl border border-line bg-surface-card p-3 shadow-panel">
            <span className={`${BLOCK} h-3 w-28`} />
            <div className="mt-3 flex min-h-0 flex-1 items-end gap-1">
              {Array.from({ length: index === 0 ? 12 : 6 }, (_, item) => (
                <span key={item} className={`${BLOCK} flex-1`} style={{ height: `${25 + ((item * 17) % 65)}%` }} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <span className="sr-only" role="status" aria-live="polite">载入站点数据并构建路网</span>
    </main>
  )
}
