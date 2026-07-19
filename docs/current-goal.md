# 当前进行中的目标

更新时间：2026-07-19

## 一句话目标

把 ShipinMUBAN 从“阶段三功能候选分支”推进到“可合并、可验收、可继续产品化”的稳定基线。

全项目复盘和完整阶段路线见 `docs/project-review-and-stage-roadmap.md`。

## 当前阶段判定

项目当前处在 **阶段三 Beta / 合并前产品化候选分支**。

- `main` 仍是初始骨架。
- PR #2 `claude/shipinmubam-handoff-avn529` 承载阶段二、阶段三的真实成果。
- 本地已验证：`tsc` 通过，GUI 可打包，批量 dry-run 通过，带浏览器回归测试 11/11 通过。
- GitHub Actions 配置已完成，但 GitHub 账户 billing / spending limit 阻止 job 启动，真实 runner 尚未执行。

## 本轮任务目标

本轮将后续阶段正式立项，并从 **阶段 3E：合并前验收** 开始执行。阶段立项与执行台账见
`docs/stage-execution-backlog.md`。

1. 明确当前目标和验收边界，避免项目状态只停留在口头复盘。
2. 建立不依赖 GitHub Billing 的本地验收入口。
3. 执行真实封面查询、自动卡点、批量 dry-run 的合并前验收。
4. 把验收结果写回文档，形成下一轮可继续执行的任务清单。

## 阶段提交规则

每完成一个明确阶段，都要把阶段性成果提交并推送到 GitHub 当前工作分支。

- 当前工作分支：`claude/shipinmubam-handoff-avn529`
- 当前 PR：#2
- 提交前至少确认 `git status` 和本阶段相关验证结果。
- 不把生成物提交入库，例如 `book-intro-maker/config/*.resolved.json`、`public/covers/`、`out/`。

## 第一批不依赖 Billing 的任务

| 任务 | 状态 | 结果 |
| --- | --- | --- |
| 明确当前目标与验收边界 | 已完成 | 新增本文档，并更新根 README 的当前状态 |
| 真实封面查询 smoke test | 已完成 | 当前环境 Open Library / Google Books 均 `fetch failed`，4 本书全部降级 placeholder |
| 阶段成果推送到 GitHub | 已完成 | 本阶段文档已推送到 PR #2 分支，并已通过远端内容回读确认 |
| 后续阶段立项 | 已完成 | 新增 `docs/stage-execution-backlog.md` |
| 阶段 3E 验收入口 | 已完成 | 新增 `npm run acceptance:3e` |
| 阶段 3E 本地验收 | 已完成 | 状态 `passed-with-followups`：封面真实下载待复测，自动卡点和批量 dry-run 通过 |
| 阶段 3E 真实 MP4 验收 | 已完成 | 1 条视频 rendered，720x1280，约 8.43 秒，约 1.57MB，抽帧非黑屏 |
| 真实封面代理诊断 | 已完成，第三方源待复测 | 脚本已支持 curl 走系统代理；当前 Open Library 为 `503`/超时，Google Books 为 `429` |
| 阶段 4A 主书封面上传 | 已完成 | GUI 打包通过；上传接口实测通过；`npm test` 6/0 通过 |
| 阶段 4B 自动卡点按钮 | 已完成 | GUI 打包通过；接口返回 14 个切点；`npm test` 6/0 通过 |
| 阶段 4B 封面查询按钮 | 已完成 | GUI 打包通过；接口降级路径实测通过；`npm test` 6/0 通过 |
| 阶段 4C 批量队列控制 | 已完成 | 暂停/恢复/单条重试/失败原因展示完成；`npm test` 12/0 通过 |

## 合并前目标

PR #2 进入 ready for review 前，必须满足：

- GitHub Billing / spending limit 恢复，CI 能真正启动。
- CI 在 GitHub runner 上跑通 `npm ci -> remotion browser ensure -> tsc -> RUN_RENDER_TESTS=1 npm test`。
- 真实封面查询 smoke test 有明确结果；若网络/API 不稳定，必须记录降级策略和后续任务。
- 至少完成一次真实素材验收：真实书封、一个本地开场视频、一份批量数据、一次自动卡点。

## 下一阶段目标

PR #2 合并后进入 **阶段三验收与阶段四产品化准备**。

重点不是继续扩功能，而是让非技术用户可以稳定使用：

- 界面内触发封面查询。
- 界面内触发自动卡点。
- 队列暂停、恢复、单条重试。
- 素材选择和本地文件管理。
- 关键帧视觉验收与截图归档。
- 桌面封装选型与安装包验证。

## 当前阻断项

- GitHub Actions 被账号 billing / spending limit 拦截，代码无法代劳。
- 真实封面查询在本机 smoke test 中仍为 `fetch failed`，需要在网络稳定环境或配置代理后复测。
- PR #2 仍为 draft，主分支不是当前事实源。

## 执行记录

- 2026-07-19：建立当前目标文档，准备执行真实封面查询 smoke test。
- 2026-07-19：执行 `npm.cmd run covers`，Open Library / Google Books 均 `fetch failed`，输出
  `books.resolved.json` 中 4 本书 `coverSource` 均为 `placeholder`。结论：封面降级链路可用，
  但真实封面下载仍未在当前网络环境闭环。
- 2026-07-19：本地 `git push` 因 GitHub 443 连接失败未完成，改用 GitHub Git Data API 将本阶段
  文档成果推送到 `claude/shipinmubam-handoff-avn529`，并通过远端内容回读确认。
- 2026-07-19：将后续阶段正式立项，当前执行阶段定为 3E 合并前验收；新增阶段执行台账与本地
  验收脚本入口。
- 2026-07-19：执行 `npm.cmd run acceptance:3e`。结果：真实封面查询 4 本均降级 placeholder；
  示例音频生成 14 个切点；示例批量数据 3 条全部 `qc-passed`；综合状态为 `passed-with-followups`。
- 2026-07-19：开启自动模式后执行 `RUN_ACCEPTANCE_RENDER=1 npm.cmd run acceptance:3e`。结果：
  `classics-night` 真实 MP4 渲染成功，720x1280，约 8.43 秒，约 1.57MB；5.5 秒抽帧非黑屏，
  缺真实封面时显示生成式封面。阶段 3E 剩余阻断仍是真实封面下载和 GitHub Billing / CI。
- 2026-07-19：诊断真实封面下载。结论：Windows 用户代理为 `127.0.0.1:18483`，PowerShell 可走代理，
  Node 直连超时；已让 `scripts/fetch-covers.mjs` 支持 curl 代理回退。重跑后脚本能走代理，但当前
  Open Library 封面图返回 `503` 或超时，Google Books 返回 `429`，真实封面仍需换网络出口或稍后复测。
- 2026-07-19：完成阶段 4A 第一版，新增主书本地封面上传能力，作为真实封面源不稳定时的本地素材兜底。
  验证：`npm.cmd run gui:build` 通过；`POST /api/assets/upload` 实测上传 68B png，`/covers/...`
  与 `/public/covers/...` 均 200；`npm.cmd test` 6/0 通过。
- 2026-07-19：完成阶段 4B 第一版，新增界面内自动卡点能力。验证：`npm.cmd run gui:build`
  通过；`POST /api/beats/detect` 对 `sample-beat.wav` 返回 14 个切点
  `[133,141,146,150,155,160,164,169,172,178,181,187,190,195]`；`npm.cmd test` 6/0 通过。
- 2026-07-19：完成阶段 4B 第二版，抽出封面查询公共模块，并新增界面内封面查询按钮。
  验证：`npm.cmd run gui:build` 通过；`npm.cmd run covers -- --force` 降级路径正常；
  `POST /api/covers/lookup` 返回 `coverSource=placeholder`、3 条 warning、服务存活；`npm.cmd test` 6/0 通过。
- 2026-07-19：完成阶段 4C 第一版，批量队列新增暂停、恢复、单条重试和失败原因展示。
  验证：`node --check` 通过；`npx.cmd tsc --noEmit` 通过；`npm.cmd run gui:build` 通过；
  `npm.cmd test` 12/0 通过；接口冒烟确认暂停/恢复状态正确，质检失败原因可见，单条重试写回原记录位置。
