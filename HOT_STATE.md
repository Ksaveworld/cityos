# CityOS 控制塔状态

> 只记录稳定入口和当前交接。每次开工先运行 `npm run doctor`，不要在这里缓存 HEAD、脏状态或历史测试结果。

- 正式目录：`C:\Users\k\Documents\ChatGPT\cityos正式版`
- 主开发分支：`codex/cityos-command-workbench`
- 最低基线：`fa1ba5d` 及其后代
- 本地入口：`http://127.0.0.1:5173`
- Vercel 项目：`cityos-command-workbench`
- 生产入口：`https://cityos-command-workbench.vercel.app/#/resources`
- 当前主线：事件已知后的态势补齐、方案推演、资源调度与执行反馈
- 冻结边界：不做火情检测、城市感知网络、自动批准或自动下发
- 并发规则：主 Agent 负责共享文件、集成与提交；并行写入必须使用隔离 worktree
- 开工检查：`npm run doctor`
- 编辑循环：运行与改动直接相关的定向测试
- 提交门禁：`npm run typecheck`
- 里程碑门禁：`npm run verify`
- 部署前检查：`npm run deploy:check`
- CI 完整门禁：`npm run verify:ci`
- Unknown：生产部署 SHA、线上访问状态和外部数据源必须在本轮重新核验
