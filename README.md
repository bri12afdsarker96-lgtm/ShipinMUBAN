# ShipinMUBAN

书籍类短视频模板生成器。当前方向是复刻并产品化“书籍分享 / 情绪金句 / 书封快闪 / 主书氛围页”这一类竖屏开场模板。

## 当前状态

- 阶段一：已完成 Remotion 第一版，可生成 `720x1280 / 30fps / 8秒` 的卡点书封快闪样片。
- 阶段二：已在 PR #2 完成配置化、真实书封查询、可替换开场视频、独立字幕轨道和缺素材降级。
- 阶段三：已在 PR #2 形成 Beta 候选，包含批量生产、模板库、自动卡点、素材库、可视化编辑器、本地服务和回归测试。
- 当前进行中的目标：把 PR #2 从阶段三 Beta 推进到可合并、可验收、可继续产品化的稳定基线，详见 `docs/current-goal.md`。
- 当前外部阻断：GitHub Actions 被账号 billing / spending limit 拦截，真实 runner 尚未执行。

## 快速运行

```powershell
cd book-intro-maker
npm.cmd install
npm.cmd run studio
npm.cmd run render
```

Remotion 脚本已经显式指定本机 Chrome 路径，避免首次渲染时卡在浏览器准备阶段。

## 目录

- `book-intro-maker/`：Remotion 模板生成器。
- `docs/requirements.md`：阶段需求。
- `docs/architecture.md`：架构骨架。
- `docs/phase-2-spec.md`：二阶段开发说明。
- `docs/phase-3-plan.md`：三阶段产品化规划。
- `docs/current-goal.md`：当前进行中的目标、验收边界和下一阶段任务。
- `docs/claude-code-task.md`：交给 Claude Code 的初步开发任务。
- `CLAUDE.md`：Claude Code 项目工作说明。

## 关键原则

第一阶段验证视觉规律，第二阶段打通真实素材和配置化，第三阶段再做可视化软件与批量生产。
