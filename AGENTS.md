# AGENTS.md

本项目的开发约定见 [CLAUDE.md](./CLAUDE.md)，内容完全适用于 Codex。

**请先完整阅读 CLAUDE.md 再开始任何工作。**

随后读取 [HOT_STATE.md](./HOT_STATE.md) 并运行 `npm run doctor`，以当前 Git、Node、端口和 Vercel 绑定结果为准；不得把历史摘要或旧测试结果当作本轮证据。

## 与 Claude Code 协同时的额外约定

本项目可能同时有 Claude Code 和 Codex 在工作。为避免冲突：

### 模块边界（默认分工）

```
Claude Code  →  src/engine/  + src/agent/      推演引擎、编排层
Codex        →  src/components/ + src/pages/   UI 组件、页面
```

### 三条硬规则

1. **不要修改分配给对方的目录**。需要对方目录里的改动时，写在 commit message 或留 TODO 注释，不要直接动手。
2. **`docs/接口契约.md` 是共同依赖，改之前必须先跟人确认**，不要单方面改。
3. **一次只在一个分支工作**。如果需要并行，用 `git worktree` 隔离。

### 如果不确定边界

停下来问，不要猜。两个 agent 同时改同一个文件的代价，远高于多问一句。
