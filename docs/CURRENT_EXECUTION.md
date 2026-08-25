# CityOS 当前执行账本

> 用途：上下文压缩、换人或中断后恢复主线时，以本文件为第一入口。
> 恢复顺序固定为：**先完整阅读本文件，再运行 `git status --short --branch` 与 `git log -5 --oneline --decorate`，最后才继续修改。**
>
> 维护规则：每次产品代码 commit、部署或上下文压缩后更新。为避免 Git 提交哈希自引用，本文分别记录“已验证产品代码 SHA”和“账本所在工作树/提交状态”；账本提交本身不冒充产品代码 SHA。

## 更新时间与仓库状态

- 更新时间：2026-08-19 14:46（Asia/Shanghai）
- 仓库：`https://github.com/Ksaveworld/cityos`
- 分支：`fix/perf-render`
- 当前产品候选 SHA：`c71258c`（本轮 C 组双模式与模拟 Signal 展示）
- 地图同步基线：`7226f1e`
- GitHub `main`：`f7a9999`；本轮明确禁止推送 `main`，恢复时必须重新检查 Git 状态
- Vercel 当前产品代码：`5d0803e` 的构建产物，production alias 已切换
- 在线地址：`https://cityos-alpha.vercel.app/`（由 `main` 自动部署；群内不发送逐次进度消息）
- 工作树：C 组产品代码与账本分别提交；`.gitignore` 有一项非本轮改动并明确不纳入提交，读取时仍以 `git status` 复核
- 已验证产品代码 SHA：`c71258c`

## 当前产品口径

1. CityOS 不做感知层能力或城市感知网络；从上游已经确认/上报的事件开始。
2. 主链路是：`Signal → Event → Context → AI Brief → Strategy → Human Decision → Task → Feedback → Review/建议报告`。
3. 路径推演只是 Strategy 环的一项能力，不是产品本身；系统比较候选后果，人工最终拍板。
4. 页面保持类 Uber 的轻量浅色风格。总览态负责发现事件；事件处置态负责九环、决策和报告。
5. 城市底图、OSM 路网、建筑轮廓和 OSM POI 可标为公开真实数据；资源实时状态、消防能力、信号配时、拥堵、ETA 模型和事件流必须明示为模拟/估算。
6. 5·16 只使用地址、接警和扑灭时刻等公开锚点；当前信号、资源、调派、反馈均不构成历史处置还原。
7. 派遣、请求开路等高风险动作必须经过 Human Decision；Demo 不向任何真实部门自动下发。

## 当前实现

- 保留单个持久 `CityMap`，总览态为 `190 / map / 320`，处置态为 `map / 520`。
- `ResizeObserver → map.resize()` 保证布局切换后 MapLibre 与 deck.gl 画布同步，不重挂地图实例。
- A/B 路线、资源点、端点、路口与封路红线统一在 deck.gl/MapLibre 相机中渲染，解决拖动缩放跟不住。
- 处置态将九环改为纵向轨道；主故事从“点路封闭”改为事件事实、候选方案、人工确认、任务与报告。
- Review 已形成可打印的建议报告，包含事实、Context、候选方案、人工决定、任务清单与来源边界。
- 增加“重置演示”，清空封路、选中方案和人工确认并回到事件总览；地图画布保持同一实例。
- MapLibre 6 worker 通过 Vite `?worker&url` 显式进入生产产物；Vercel 不再把缺失 worker 路径回退成 HTML。
- 在线底图只有在矢量瓦片真正加载完成后才标记成功；8 秒未完成或连续瓦片错误时完整切回本地高清底图。
- 已选择性合并 `ui/chaoxin-dashboard` 的 5 个提交：接入设计 token、六级字体、纵向九环与 EventCard/Field，同时保留当前双栏处置、组件 memo、compact 九环、人工决策链和建议报告/PDF。
- `29afce1` 已完成王君梅《Demo 细节修改》（[Feishu wiki](https://xqmqf98k8t.feishu.cn/wiki/EQyIwsWPZiWOnXkX2fCcn89dnmb)，文档 revision 289）：首页火情卡强化重点告警，公安与无人机图标区分；详情右栏加宽，前四环默认合并且可展开；5·16 公开复盘的 Signal 保留视频/报警人语音/舆情三项“仅输入契约、未接入”；Strategy 可打开阅读报告；Human Decision 展示全部候选及关键指标并将优先阅览方案排首（误差带重叠时明确不是强推荐）。
- 地图默认保留路线、两个路线锚点（蓝色消防站起点与红色火情终点）、路线图例与标准地图控件；不默认铺开医院、资源、路口等大量散点与数据口径浮卡。OSM/模拟数据口径放入固定左栏，封路验证工具仅在用户主动点选道路后显示。
- Strategy 及后续环节会显示当前方案的 0–3 个开路节点候选；普通基线 B 没有请求开路动作时明确显示“当前方案 · 不请求开路”，不伪造点位。
- 新增“资源参考”地图开关，默认关闭且首次打开才加载；只显示附近 3 个非起点消防站和 3 个医院，图例均标为“公开参考”，关闭后点位与图例同步消失。
- 总览态右侧事件面板由 `226px` 加宽为 `320px`；详情态仍为 `520px`，确保事件卡、字段、告警与两个操作按钮可直接阅读，地图仍保持主区域。
- 地图控件从图例上方进一步上移至 `bottom: 190px`，避免在 1180 视口与新增端点图例重叠。
- `0de2d29` 在原火情入口内增加「5·16 公开复盘 / 日常响应模拟」模式切换；切换会清空环位置、方案选择、人工确认和封路状态，日常模式不复用 5·16 地图、路线、资源、ETA 或处置数据。
- `c71258c` 为日常响应展示现场多模态、报警人语音、舆情三条模拟 Signal；每条均显示来源名称、「模拟输入样例 · 未接入真实源」和既有空心 `OriginMark`。119 只展示附带文字稿的模拟样例，不增加播放控件；未扩展额外火势媒体。
- 日常事件固定为「【模拟】金融城高层办公楼火情联动」：地址天河区黄埔大道中 376 号，地上 50 层/地下 5 层，商业办公，模拟接警时刻 2025-08-11 15:00；所有事件、时序、Signal 和处置状态仍标为模拟。

## 验证证据

- `npm run typecheck`：PASS（2026-08-18）
- `npm run lint`：PASS，0 error；3 条既有 Fast Refresh warning
- `npm run build`：PASS；主 JS 1,842.44 kB / gzip 512.31 kB，独立 worker 470.28 kB，体积告警登记为 P1
- DEV `#/selftest`：全部 43 项通过
- 1180×800 与 1440×900：无横向滚动；总览↔处置往返 10 次均保持同一 MapLibre canvas，容器与两层 canvas 尺寸一致
- 地图交互：A/B/共有/路径外道路命中矩阵已通过；封闭整条 OSM way 后真实重算，撤销成功
- 黄金路径：九环全部可达；人工确认后进入 Task；报告草案/已确认两态均可达
- 重置：清除人工确认和封路、回到总览、保留同一地图 canvas
- 在线底图阻断：9 秒后显示本地高清 OSM，地图、路线和页面均可用
- 生产灰屏根因复现：旧版本请求 `/assets/maplibre-gl-worker.mjs`，生产端返回 HTML/404；MapLibre worker 因 MIME 错误未启动，OpenFreeMap 瓦片不进入渲染。
- 修复后本地 production preview：道路、河流、地名与建筑均可见；`isStyleLoaded()`、`loaded()`、`areTilesLoaded()` 全为 true；运行错误 0。
- 修复后完整烟测：拖动与滚轮缩放成功；封路命中、重算、撤销成功；九环全部可达；人工确认、任务、报告和 PDF 成功；运行错误 0。
- 视觉合并候选 `0244db2`：typecheck PASS；lint 0 error（3 条既有 Fast Refresh warning）；build PASS，主 JS 1,840.65 kB / gzip 512.38 kB，独立 worker 470.28 kB。
- 视觉合并本地 production preview：1180×800 总览态与处置态无横滚；在线底图可见；MapLibre/deck 两层 canvas 同尺寸；浏览器运行错误 0。
- 浏览器运行错误：两种视口测试均为 0；1180 与全新 1440 构建均生成 224,323 字节 PDF，经 Poppler 渲染逐页检查，无横向或分页裁切
- QA 截图与 PDF：`C:/Users/k/.codex/visualizations/2026/08/18/01a01349-32cb-7442-a8df-b8e59b3f4648/`
- 补推后线上产物核对：`index.html` 引用 `/assets/index-BeNqhl8e.js` 与 `/assets/index-Diae1RjQ.css`，与本地 `deb5e8a` 构建的哈希和字节数逐一吻合（1,840,650 B / 121,559 B）
- 灰屏根因回归核对：`/assets/maplibre-gl-worker-COyPxcFs.js` 线上 200 且 `application/javascript`（470,280 B）；旧的无哈希路径 `/assets/maplibre-gl-worker.mjs` 返回 404 且已无请求方
- 补推后线上验收（1440×900）：在线底图正常载入未回退，MapLibre 与 deck 两层 canvas 同为 1227×820，无横向滚动，浏览器控制台错误 0
- `29afce1` 静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,831.84 kB / gzip 510.82 kB，独立 worker 470.28 kB。
- `29afce1` 本地交互烟测：1440×900 与 1180×800 无横纵滚动，MapLibre/deck 两层 canvas 尺寸一致；首页→处置、前四环展开/收起、Strategy 报告对话框、Human Decision A/B 选择均通过；浏览器 error/unhandledrejection 为 0。
- `8162d40` 静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,846.96 kB / gzip 513.96 kB，独立 worker 470.28 kB。
- `8162d40` 浏览器烟测：1440×900 与 1180×800 无横滚，蓝色消防站起点、红色火情终点、路线和图例可见；未恢复资源/路口散点；总览右栏 `320px` 下首张火情卡清晰，浏览器 console error 为 0。1180×800 最新截图实测图例与四个地图控件交叠面积均为 0（`C:/Users/k/.codex/visualizations/2026/08/18/01a01349-32cb-7442-a8df-b8e59b3f4648/controls-1180x800-latest.png`）。
- `5d0803e` 静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,849.74 kB / gzip 514.76 kB，独立 worker 470.28 kB。
- `5d0803e` 交互烟测（1180×800）：默认总览仅路线与起终点；进入 Strategy 显示 3 个绿色开路节点；资源参考打开时少量消防站/医疗点与图例同步出现，关闭后同步消失；图例与 5 个地图控件交叠面积为 0，`scrollWidth=1180`，console/page error 为 0。截图：`C:/Users/k/.codex/visualizations/2026/08/18/01a01349-32cb-7442-a8df-b8e59b3f4648/layer-smoke-*.png`。
- A1 候选静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,849.93 kB / gzip 514.85 kB，独立 worker 470.28 kB。
- A2 候选静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,849.93 kB / gzip 514.87 kB，独立 worker 470.28 kB。
- A3 候选静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,850.14 kB / gzip 514.96 kB，独立 worker 470.28 kB。
- A4 候选静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,850.26 kB / gzip 515.00 kB，独立 worker 470.28 kB。
- `b89beff` A 组浏览器验收：1440×900 与 1180×800 共 55 项断言全部通过；A1–A4 交互、封路重算/撤销/清空、任务草案回退、重置演示、十次总览↔处置往返、无横向滚动、canvas 同尺寸、来源/模拟标识、console 与 pageerror 均通过。
- `b89beff` 双视口 canvas：1440×900 为 888×656，1180×800 为 628×556；两种视口各自的 MapLibre 与 deck 两层尺寸一致，十次往返后保持同一 MapLibre canvas。
- `b89beff` 离线回退：阻断 OpenFreeMap 后，本地 `liwan_haizhu_basemap.png` 返回 HTTP 200；等待绘制后完整底图、路线与点位可见，页面仍可操作，pageerror 为 0。
- `b89beff` DEV `#/selftest`：43/43 PASS；仅作纯引擎回归护栏，不替代上述本轮浏览器验收。
- A 组验收截图与脚本：`C:/Users/k/.codex/visualizations/2026/08/19/01a0184a-4691-7be2-8c45-eaa7872fe32c/`。
- `0de2d29` 静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,854.19 kB / gzip 516.32 kB，独立 worker 470.28 kB。
- `c71258c` 静态闸门：`npm run typecheck` PASS；`npm run lint` 0 error（3 条既有 Fast Refresh warning）；`npm run build` PASS，主 JS 1,858.20 kB / gzip 517.21 kB，独立 worker 470.28 kB。
- C 组浏览器验收：1440×900 与 1180×800 共 87 项断言全部通过；一个入口切模式、固定事件参数、3 条模拟 Signal、逐条来源空心形状、公开/模拟数据隔离、人工确认与封路清空、九环合并态、底部四卡、主导航、地图头部四 tab、无横向滚动、console 与 pageerror 均通过。
- C 组 DEV `#/selftest`：43/43 PASS；仅作纯引擎回归护栏，不替代上述浏览器验收。
- C 组禁用词扫描：可执行 `src` 与本轮新增行 0 命中；历史决策/边界文档保留对禁用词本身的治理记录，不计为产品文案。
- C 组截图与验收脚本：`C:/Users/k/.codex/visualizations/2026/08/19/01a0184a-4691-7be2-8c45-eaa7872fe32c/c-group-*`。

## 本轮 A 组实现缺陷修正（2026-08-19）

- A1 已完成：前四环收起时头部显示「事件研判 · 1–4 / 9」，主 CTA 显示「进入方案推演」并一步进入 Strategy；展开态及 5–9 环保留既有环号、文案和行为。
- A2 已完成：前四环展开状态上移至 `RightPanel`；建议报告的「事件事实」「上下文补齐」回看会先展开前四环，再落到 Event / Context 对应环，进入 Strategy 时自动收起。
- A3 已完成：已有人工确认被新增封路撤销时，底栏人工门禁显示「封路条件变更，需重新确认」；撤销/清空封路、重新确认或重置演示后恢复既有非真实下发声明。
- A4 已完成：底部统计条 119 消防使用火焰图标，110 公安保留盾牌图标，无人机图标不变。
- 本轮只改当前浅色实现的既有状态表达，不调整 design token、字体、accent 配额、来源角标形状编码、九环形态、底部四卡、导航、场景 tab、布局栅格或间距。
- A 组最终验收：决策记录第 99–108 行的交互与回归项全部通过；生产部署和 `main` 推送未执行。

## 本轮 C 组日常响应模拟（2026-08-19）

- 入口：不新增第二个事件入口；在原火情卡和详情头部切换「5·16 公开复盘 / 日常响应模拟」。
- 事件基线：采用广州市 2025-08-11 高层建筑应急演练参数。演练时段见[广州市应急管理局通知](https://yjglj.gz.gov.cn/zz/xwzx/tzgg/content/post_10389202.html)；18 层电气线路故障、10 分钟扩大至 300 平方米及人员被困的演练情景见[广州市政府公开报道](https://www.gz.gov.cn/zt/mlxgzjqswy/qyhmcssj/content/post_10397628.html)；50 层地上/5 层地下及商业办公用途见[广州市规划和自然资源局批后公示](https://ghzyj.gz.gov.cn/ywpd/cxgh/ghxkgsgb/phgbnew/gbt/content/post_9619374.html)。15:00 仅作为模拟接警时刻，不是真实 119 记录。
- 数据真实性：日常模式所有卡片保持 `simulated`，明示未发生真实火情、未接入真实报警/音视频/舆情源；不得因采用公开演练参数改标为公开真实事件。
- Signal 展示：现场多模态、报警人语音、舆情分别展示一条模拟样例、来源、时间、归并落点、可信度和来源形状编码；不创建真实事件单，不触达真实部门。
- 模式隔离：两模式只共享一个 UI 入口，不共享事件事实、地图计算、路线、资源、ETA、封路、方案选择或人工确认状态；双向切换均重置到各自起点。
- 可选项裁剪：未做真实音视频接入、119 播放或额外火势媒体；参考 PDF 仅用于构图核对，建筑传感器、无人机热成像、消防站端和手机端均未实现。
- 冻结项：未改 `ChainRail` 九环折叠形态、底部四卡数量、主导航入口、地图头部四个场景 tab、布局栅格/间距、design token、六级字体、accent 配额或 `OriginMark` 形状编码。
- 目录边界：未改 `src/engine`、`src/agent`、`docs/接口契约.md`；未新增依赖；未部署；未推送 `main`。

## Pending

1. `<1180 CSS px`（常见于系统缩放 125%/150%）仍会因固定最小宽度裁切右栏；根容器 `min-w-[1180px]` 已在线上复核确认，这不是灰屏根因，登记为独立响应式 P1。
2. P1 决策优先确认第三条多目标路径和 Strategy 命名；复盘/模拟入口已经按一个入口切模式落地。
3. 《CityOS - Signal 信号接入》的真实数据链路仍未开工；三级映射「匹到街区 → 匹到楼 → 匹到布防力量」与归一化四动作仍需落到代码。当前 C 组仅为明确标识的 UI 模拟样例。

## Unknown

- 最新方案希望 2–3 条多目标路径；当前只有紧急特权 A 与普通基线 B，是否必须补第三条尚未拍板。
- 旧方案的 Strategy A/B/C 是响应等级，新方案的 A/B 是路线候选，命名冲突尚未正式消解。
- 真实角色权限、开路提前量、路口信号属性和配时仍未知，不能写成已接入能力。
- 110、台风、无人机、外呼、真实政府接口、火势预测与自动调度均不属于当前 P0。

## 下一步

1. 若进入真实 Signal 接入，再单独定义三级映射、归一化、权限、接口与验收；当前三类卡片继续保持模拟样例与未接入真实源声明。
2. 单独处理 `<1180 CSS px` 响应式裁切；不得与其它改动混成一个风险更大的提交。
3. 下一轮先解决第三条多目标路径和 Strategy 命名的产品拍板，再开始其它 P1。

## 本轮分层地图发布（2026-08-18 21:34 Asia/Shanghai）

- 部署源：`fix/perf-render@f946da3`（可运行产品代码 `5d0803e`；其余提交为账本）。
- Vercel 状态：`READY`。
- 生产地址：[https://cityos-alpha.vercel.app/](https://cityos-alpha.vercel.app/)；alias 已切换到本轮 deployment。
- Vercel deployment：`dpl_BzVzig5atks7RSA2eziJD588vY8m`。
- 部署记录：[https://vercel.com/kwillsaveworld/cityos-demo/BzVzig5atks7RSA2eziJD588vY8m](https://vercel.com/kwillsaveworld/cityos-demo/BzVzig5atks7RSA2eziJD588vY8m)。
- 发布证据：Vercel CLI 云端执行 `npm run build` 后返回 `READY`，alias 命令返回 `Success`；发布前已完成资源开关、Strategy 节点、1180×800 无横滚/零控件重叠/控制台 0 错误烟测。

## 本轮源码同步（2026-08-18 21:36 Asia/Shanghai）

- 动作：`git push origin fix/perf-render:fix/perf-render fix/perf-render:main`。
- 结果：`2379410..0b56e87` 快进到两个远端分支；未 force、未 rebase、未带入用户的 `.gitignore` 未提交改动。
- 一致性：已验证产品代码为 `5d0803e`；`f946da3` 与 `0b56e87` 仅记录账本，不改变前端构建源码。

## 本轮锚点与布局修正发布（2026-08-18 21:23 Asia/Shanghai）

- 部署源：`fix/perf-render@2ea166e`（可运行产品代码 `8162d40`；其余提交为账本）。
- Vercel 状态：`READY`。
- 生产地址：[https://cityos-alpha.vercel.app/](https://cityos-alpha.vercel.app/)；alias 已切换到本轮 deployment。
- Vercel deployment：`dpl_BgavjEz2QkjqdszCmBZFDq3PhLht`。
- 部署记录：[https://vercel.com/kwillsaveworld/cityos-demo/BgavjEz2QkjqdszCmBZFDq3PhLht](https://vercel.com/kwillsaveworld/cityos-demo/BgavjEz2QkjqdszCmBZFDq3PhLht)。
- 发布证据：Vercel CLI 云端执行 `npm run build` 后返回 `READY`，alias 命令返回 `Success`；发布前本地 1180×800 图例与地图控件交叠面积均为 0。

## 本轮源码同步（2026-08-18 21:24 Asia/Shanghai）

- 动作：`git push origin fix/perf-render:fix/perf-render fix/perf-render:main`。
- 结果：`f861a40..31448bf` 快进到两个远端分支；未 force、未 rebase、未带入用户的 `.gitignore` 未提交改动。
- 一致性：已验证产品代码为 `8162d40`；`2ea166e` 与 `31448bf` 仅记录账本，不改变前端构建源码。

## 本轮直接发布（2026-08-18 21:10 Asia/Shanghai）

- 部署源：`fix/perf-render@b8f38f5`（产品代码 `29afce1`；后者为本轮可运行代码 SHA）。
- Vercel 状态：`READY`。
- 生产地址：[https://cityos-alpha.vercel.app/](https://cityos-alpha.vercel.app/)；该 alias 已指向本轮 deployment。
- Vercel deployment：`dpl_ATCheyB69yzdSKeV8vUvcoc4Mwg7`。
- 部署记录：[https://vercel.com/kwillsaveworld/cityos-demo/ATCheyB69yzdSKeV8vUvcoc4Mwg7](https://vercel.com/kwillsaveworld/cityos-demo/ATCheyB69yzdSKeV8vUvcoc4Mwg7)。
- 发布证据：Vercel CLI 在云端重新执行 `npm run build` 后返回 `READY`；alias 命令返回 `Success`。遵循部署规范，未用 HTTP 抓取替代页面验收；发布前已完成本地浏览器烟测。

## 本轮源码同步（2026-08-18 21:12 Asia/Shanghai）

- 动作：`git push origin fix/perf-render:fix/perf-render fix/perf-render:main`。
- 结果：`c1c5eca..6c3ffe8` 快进到两个远端分支；未 force、未 rebase、未带入用户的 `.gitignore` 未提交改动。
- 一致性：已验证产品代码仍为 `29afce1`；`b8f38f5` 与 `6c3ffe8` 仅记录账本，不改变前端构建源码。

## 最近部署

- 部署源：本地 `fix/perf-render@7ba5c8d`，其中已验证产品代码为 `0c235ae`
- 完成时间：2026-08-18 18:03（Asia/Shanghai）
- Vercel 状态：`READY`
- 生产地址：`https://cityos-alpha.vercel.app/`（alias 地址保持不变）
- Vercel deployment：`dpl_HaTK53bzCTQaDBTFHd26d1GRdzJv`
- Vercel 部署记录：`https://vercel.com/kwillsaveworld/cityos-demo/HaTK53bzCTQaDBTFHd26d1GRdzJv`
- 发布方式：Vercel CLI 直接生产部署后，将既有 `cityos-alpha.vercel.app` alias 指向新 deployment；GitHub `main` 尚待网络恢复后补推
- 线上快速验收：1287×640 无横滚、底图/路线/点位均可见、两层 canvas 同尺寸、浏览器运行错误 0
- 待部署候选：`0244db2`（潮鑫 dashboard 视觉收敛与当前业务骨架的选择性合并）

## main 补推（2026-08-18 20:55 Asia/Shanghai）

- 动作：`git push origin fix/perf-render:main`，`25cb0e8..deb5e8a` 快进，无 force、无历史重写；同时把 `fix/perf-render` 由 `b54fe41` 推到 `deb5e8a`。
- 推送前闸门：`npm run typecheck` PASS；`npm run build` PASS，主 JS 1,840.65 kB / gzip 512.38 kB、worker 470.28 kB，与候选 `0244db2` 的记录一致。
- 推送前已确认 `git log fix/perf-render..origin/main` 为空，即 `origin/main` 是祖先，快进成立。
- 补推前的风险：`origin/main@25cb0e8` 既不含灰屏修复 `0c235ae` 也不含视觉合并 `0244db2`，而线上产物来自本地直接部署。在那个状态下任何人向 `main` 推一次，Vercel 都会用旧代码重建并覆盖线上，灰屏复发。补推后该风险解除。
- 网络处置：GitHub 推送连接重置，为本仓库配置 `http.proxy=http://127.0.0.1:7890`、`http.postBuffer=524288000`、`http.version=HTTP/1.1` 后推送成功。配置只写在本仓库 local config。

## 回滚点

- 生产回滚点：`647f34c`（本轮发布前的 `origin/main`）。
- 本次灰屏热修发布前回滚点：`25cb0e8`。
- main 补推前回滚点：`25cb0e8`（补推后 `origin/main` 为 `deb5e8a`）。注意 `25cb0e8` 不含灰屏修复，回到该点会让灰屏复发，只能作为代码回退参照，不可作为生产回滚目标；生产回滚一律走 alias 指回已验证 deployment。
- 本次灰屏热修发布前 Vercel deployment：`6wT7HKggmmGwxScs1kok1LoMsi96`；需要回滚时将生产 alias 指回该已验证 deployment。
- 地图同步本地回滚点：`7226f1e`（本轮双态布局/报告改动前）。
- 回滚方式：只允许新建 `revert` commit 或把 Vercel production alias 指回上一条已验证 deployment；禁止 `reset --hard`、force push 和 rebase 已发布历史。
