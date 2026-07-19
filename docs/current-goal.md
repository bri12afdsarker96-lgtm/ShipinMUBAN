# 当前进行中的目标

更新时间：2026-07-19

## 一句话目标

把 ShipinMUBAN 从“阶段三功能候选分支”推进到“可合并、可验收、可继续产品化”的稳定基线。

## 当前阶段判定

项目当前处在 **阶段三 Beta / 合并前产品化候选分支**。

- `main` 仍是初始骨架。
- PR #2 `claude/shipinmubam-handoff-avn529` 承载阶段二、阶段三的真实成果。
- 本地已验证：`tsc` 通过，GUI 可打包，批量 dry-run 通过，带浏览器回归测试 11/11 通过。
- GitHub Actions 配置已完成，但 GitHub 账户 billing / spending limit 阻止 job 启动，真实 runner 尚未执行。

## 本轮任务目标

本轮不继续堆新功能，先把“能稳定交付”的边界打牢。

1. 明确当前目标和验收边界，避免项目状态只停留在口头复盘。
2. 执行不依赖 GitHub Billing 的验收任务，优先复核真实封面查询链路。
3. 把验收结果写回文档，形成下一轮可继续执行的任务清单。

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
| 阶段成果推送到 GitHub | 已完成 | 本阶段文档已推送到 PR #2 分支，远端提交 `4a11d9a` |

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
  文档成果推送到 `claude/shipinmubam-handoff-avn529`，远端提交 `4a11d9a`。
