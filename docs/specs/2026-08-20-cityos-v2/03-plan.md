# CityOS v2 · Technical Plan

> 状态：Gate 2 已确认，2026-08-20 用户授权进入开发。本文固定状态模型、模块边界、视觉方案、风险、回退点和集成顺序；共同接口契约仍不在本轮改动范围。

## 0. 基线与约束

- 冻结基线：`fix/perf-render`，`BASE_SHA=f2d091cf6319169d8746e5ce5bf663e70dc23710`。基线工作树干净，本地领先远端 6 个已提交变更。
- 实施分支：`codex/execution-playback-v1`。原分支保持停在 `BASE_SHA`；本轮不 push、不 merge，候选版本须先完成人工审看。
- 现有可复用底座：React + TypeScript + Vite、MapLibre GL JS、deck.gl、现有路由重算、离线底图回退、单个持久地图实例、来源标识和九环外壳。
- 不修改：`src/engine/`、`src/agent/`、`docs/接口契约.md`，除非 Gate 2 后发现 UI 适配无法表达已冻结验收且由共同 Owner 明确批准。
- 不新增依赖。本轮视觉增强使用已经安装的 `deck.gl@9.3.10` 与 `maplibre-gl@6.4.0`。
- 所有模拟事件、资源、ETA、任务、送达和执行状态必须保留文字标签与形状编码；不得变成“看起来真实”的无说明动效。

## 1. 设计读法与视觉原则

设计读法：这是面向评审和现场演示的城市安全指挥产品，视觉语言应当可信、克制、信息密集而非科技炫技；在入口页和历史执行舞台采用有目的的叙事动效。

| 维度 | 值 | 约束 |
| --- | --- | --- |
| 视觉变化度 | 3 / 10 | 延续现有浅色、轻量、类指挥台语言，不换成深色霓虹或玻璃特效。 |
| 动效强度 | 6 / 10 | 地图中的车辆、路线、节点、镜头和时间线同步；非关键区域不循环抢注意力。 |
| 信息密度 | 7 / 10 | Brief、任务、状态和来源可扫读，但不把五域做成五套复杂看板。 |

`design-taste-frontend` 只用于进入态与动态舞台的视觉判断；该技能本身不适用于密集 Dashboard，因此现有主看板的设计系统、可读性与地图优先级继续保留。

## 2. 领域与工作流架构

### 2.1 五域共享核心，场景配置分开

```text
DomainFixture[119 | 110 | 120 | traffic | major]
          ↓
WorkflowSession（按 domainId 隔离）
          ↓
Input → Event → Brief → Plans → Approval → TaskPackage → Delivery
          ↑                                  ↓
          └──── Adjustment → Recompute → ApprovalInvalidated ────┘
```

- `DomainFixture` 是 UI 层数据适配：模板字段、Brief 条目、A/B 文案、资源、负责人、可调整项、风险摘要、场景地图锚点和阶段时间线。只有荔湾 5·16 与 110 广州火车站两个 fixture 额外携带动态舞台所需的路线几何与阶段脚本。
- `WorkflowSession` 是 UI 层纯状态；所有域拥有独立 session，禁止目前的全局 `approvedPlanId`、送达状态或草稿跨域串用。
- 路由/ETA 继续优先调用现有 `buildRoutingView`。当某域的调整没有现成可计算模型时，重算结果必须明确为“ETA 未变化/模型不适用”，不可伪造数值。
- 120 新增独立 `medical` fixture、地图配置、筛选/同级入口和医疗急救任务，不以 119 的医疗支援路线代替。

### 2.2 最小状态机

```text
draftInput
  → inputValid
  → briefReady
  → plansReady
  → approved(vN)
  → taskPackageReady(vN)
  → pendingSend
  → delivered / exception

conditionChanged
  → recomputing
  → approvalInvalidated(vN)
  → plansReady(vN+1)
  → approved(vN+1)
  → controlledRetryOnce
  → delivered → acknowledged → executing → completed
```

不变量：

1. 未批准不能产生有效任务包、送达或签收；
2. 车辆数量、资源点、负责人、封路或其他关键条件变化后，批准、任务包和送达资格同时失效；
3. 受控重试只允许一次，且必须发生在重新批准之后；
4. 模式/域切换清空或隔离本域状态，绝不把 5·16 公开事实、路线或批准带入其他场景；
5. 所有高风险动作仍是人工决定，演示不产生外部副作用。

### 2.3 历史三轨模型

```text
5·16 公开事实与缺口
        │
        ├── 公众信息约束下的基线处置模拟 (B)
        └── CityOS 方案模拟 (C)
```

- 公开轨仅使用已核验的时间、地点、事件和来源；OSM 数据写为“当前公开地理快照”。
- B、C 均为模拟/估算。两者只有 `assumptionSetId`、地图快照和模型版本相同才允许展示效果差异。
- UI 严禁把 B 叫作“原处置”“真实路线”“现场回放”，也严禁把 C 说成“证明真实更优”。

## 3. 动态舞台方案

### 3.1 不新增依赖的实现

现有 `CityMap.tsx` 已使用 deck.gl `TripsLayer`、`PathLayer`、`MapboxOverlay` 和 `requestAnimationFrame`。历史舞台采用一个统一 `playhead`：

```text
playhead
  → 当前阶段
  → TripsLayer.currentTime / 路线亮度
  → MapLibre 镜头和路况/封控图层
  → 车辆、任务节点、异常脉冲
  → 右侧任务状态和底部时间线
```

必须具备播放、暂停、重放、时间线拖动和 reduced-motion 离散步骤回退。没有一个元素可以脱离 `playhead` 单独“假动”。

视觉层级：

- 公开事实：实心锚点、绝对时间；
- 基线模拟 B：中性灰路线、空心 `B` 资源；
- CityOS 模拟 C：主色路线、空心 `C` 资源；
- 估算：半填充标记与 `ETA（估算）`；
- 未公开：灰色问号/文字“未公开/未核实”。

**动态舞台只做两个**（D-12，21:05 会 01:54–02:32）：荔湾 5·16 与 110 广州火车站持刀伤人。两者共用同一套 `playhead` 编排代码，只换 fixture、路线几何和阶段文案。

其余域（120、交通、日常高层火情、重大布防）在执行步骤**只出方案**：静态场景地图 + 阶段时间线，**不做单位沿路线移动**。原计划的"四个域轻量执行动效"已作废。

其中 120 与交通的场景地图和方案产出要做到完备（D-17），完成度足以单独讲清事件、资源和建议路线，不是占位图。

省下的动效工作量转投到那两个舞台的完成度上——16:15 会 07:43 要求至少一个场景做到"消防车从消防站开出、到现场、下来一组人形标记"。

### 3.2 开源调研裁决

| 候选 | 结论 | 原因 |
| --- | --- | --- |
| deck.gl `TripsLayer` | 采用 | 已装、MIT、MapLibre 兼容、离线、直接匹配车辆/轨迹动效。 |
| MapLibre GL JS | 采用 | 已装、当前离线回退已验证，原生层与镜头动画足够。 |
| TripTrail | 仅借鉴 | MIT、时间轴编排值得参考，但完整项目依赖在线 OSRM/Nominatim。 |
| Motion | 暂不引入 | MIT 且活跃，但会新增包；现有 CSS/Web Animations 足够做 DOM 转场。 |
| flowmap.gl / vis-timeline | 不进入 P0 | 资源流和可缩放时间线有价值，但额外依赖/体积不适合单案例冲刺。 |

## 4. 模块边界与 Owner

| 范围 | 唯一 Owner | 允许改动 | 禁止改动 |
| --- | --- | --- | --- |
| 集成编排 | 集成 Owner | `src/App.tsx`、现有导航/面板接线、状态装配 | 不在此处重写 engine 或复制路由算法。 |
| UI 工作流状态 | Workflow Owner | 新建 `workflow/*` 纯类型、fixture、transition、测试辅助 | 不改 `docs/接口契约.md`、不改 `src/engine/`。 |
| 日常输入/Brief/送达组件 | Workflow Owner | 新建 dashboard 组件 | 不直接改 `App.tsx` 或 `CityMap.tsx`。 |
| 五域场景地图 / 图层语言改造 | Map Owner | `ScenarioMap.tsx`、`mapLayers.ts`、受限的 `CityMap.tsx` 图层适配 | 不改 MapLibre 初始化、worker、在线/离线 fallback；不在此处做动态舞台。 |
| 5·16 三轨与两个动态舞台 | History Owner | 新建 `historical/*` 组件和 UI 数据 | 不把模拟写入 engine 公开事实，不造外部请求。 |
| 验收与集成 | 集成 Owner | `SelfTest.tsx`、浏览器脚本、`CURRENT_EXECUTION.md` | 不把历史验收当作当前结果。 |

当前工作树已在实施分支上保持干净。共享文件仍一次只允许一个集成 Owner 修改；如后续需要并行写入，必须先建立隔离 worktree，不在同一工作树并发改 `App.tsx`、`CityMap.tsx`、`RightPanel.tsx` 或 `WorkflowSimulationPanel.tsx`。

## 5. 交付顺序

1. 记录本轮基线和保护现有未提交 diff；
2. 建立五域 `DomainFixture + WorkflowSession` 与纯转移测试；
3. 新增 120 fixture，并把所有五域接入统一入口、输入、Brief、方案和门禁；
4. 接入任务包、送达状态、条件调整和受控重试；
5. 实现 5·16 三轨数据、完整动态舞台及知识沉淀草稿；
6. **复用同一套 playhead 实现 110 广州火车站持刀伤人的第二个动态舞台**；其余域只补静态场景地图与阶段时间线；
7. 主看板 dashboard 与进入页；地图图层语言改造（D-15）；
8. 扩展 SelfTest，跑类型、lint、build、浏览器双视口、离线和两条完整录屏候选。

**交付日期 2026-08-25 周二**（D-18），自 8/20 深夜起约四天半。

**不做范围裁剪**（D-19）。工期压力一律通过降低单点实现复杂度吸收，而不是删条目：

| 压缩手段 | 允许 | 不允许 |
| --- | --- | --- |
| 两个舞台共用同一套 `playhead` 与图层代码，只换 fixture | ✅ | 为了省事只做一个舞台 |
| 六个 fixture 共用同一份 Brief/方案模板结构，只换文案与数值 | ✅ | 砍掉 120 或交通 |
| 场景地图先用简化几何，路线取直连段而非完整路网求解 | ✅ | 让某个域停在占位图 |
| dashboard 的图表先用静态数据，不接实时重算 | ✅ | 不做 dashboard |
| 图层语言改造先覆盖出现在演示脚本里的图层 | ✅ | 保留被否决的"加粗加深"和圆圈天气 |

确实吃不下的部分停下来交给用户决定，不自行降级。

## 6. 风险与回退

| 风险 | 处理 |
| --- | --- |
| 当前分支误带入其他改动 | 每个阶段只暂存命名文件，不使用 `git add -A`；提交前读取 `git diff --cached`。 |
| 120 为真新增场景 | 在 UI fixture 层实现，不污染 119 engine 契约。 |
| `App.tsx` / `CityMap.tsx` 高耦合 | 先以新 UI 状态和适配器接入；持久 canvas、worker、fallback 不重写。 |
| 基线模拟被误读成真实历史 | 固定三轨标题、形状和时间格式；SelfTest/浏览器审查文字。 |
| 动效影响性能或离线 | 使用本地几何和已有 rAF；`document.hidden` 暂停；reduced-motion 降级；阻断在线底图实测。 |
| 五域变成五份重复代码 | 只允许 fixture 差异，禁止复制 workflow 状态机与送达逻辑。 |

### 6.1 版本与回退门禁

1. 每个阶段形成一个可独立验收的 commit；代码 commit 前至少运行 `npm run typecheck`。
2. 文档、回放模型、5·16 地图动态、任务/异常/到场、广州火车站复用、测试与验证记录分别提交，不混成一个大提交。
3. 单阶段不理想使用 `git revert <commit>`；整项不采用时切回仍停在 `BASE_SHA` 的 `fix/perf-render`。
4. 禁止 `reset --hard`、amend、rebase 和 `--no-verify`；不通过改写历史实现回退。
5. 5·16 视觉舞台完成人工审看后，才复用到广州火车站，避免放大不理想的视觉方案。
6. 候选版本须 fresh 通过 typecheck、lint、build、SelfTest、双视口、离线回退、路线/封路矩阵和三次完整彩排；旧 PASS 或旧录屏不作为本轮证据。
