# 后续阶段立项与执行台账

更新时间：2026-07-19

## 总目标

将 ShipinMUBAN 从当前的阶段三 Beta 候选分支，推进为可合并、可验收、可继续产品化的本地视频模板软件。

这份台账用于回答三个问题：

1. 后续每个阶段到底要交付什么。
2. 每个阶段完成到什么程度才算结束。
3. 每完成一个阶段如何提交并上传到 GitHub。

## 当前执行阶段

当前正式立项的执行阶段是 **阶段 3E：合并前验收**。

阶段 3E 不以新增大功能为主，而是把已经完成的阶段二、阶段三能力跑通、验明、归档，确认 PR #2 可以从 draft 推进到 ready for review。

## 阶段闸门

| 阶段 | 状态 | 目标 | 完成标准 |
| --- | --- | --- | --- |
| 3E | 进行中 | 合并前验收 | CI 真跑绿；真实素材验收有记录；PR #2 可转 ready |
| 4A | 待立项 | 素材管理产品化 | 界面内选择/上传封面、音乐、背景、开场视频，无需手写路径 |
| 4B | 待立项 | 封面与卡点一键化 | 界面内触发封面查询、自动卡点，并能预览结果 |
| 4C | 待立项 | 队列控制 | 支持暂停、恢复、单条重试、失败原因展示 |
| 4D | 待立项 | 视觉验收 | 自动导出关键帧截图，便于人工检查遮挡、错位、字幕溢出 |
| 5A | 待立项 | 桌面封装选型 | Electron / Tauri 做出可运行原型，确认 Windows 可启动 |
| 5B | 待立项 | 分发包与示例工程 | 非开发机器可安装，示例工程可打开、预览、渲染 |

## 3E 任务包

| 编号 | 任务 | 状态 | 交付物 |
| --- | --- | --- | --- |
| 3E-1 | 建立合并前验收脚本入口 | 已完成 | `npm run acceptance:3e` |
| 3E-2 | 真实封面链路复测 | 已完成，需后续复测真实下载 | `out/acceptance/3e/*/acceptance-report.json` |
| 3E-3 | 自动卡点链路复测 | 已完成 | 切点 JSON 与验收报告 |
| 3E-4 | 批量 dry-run 复测 | 已完成 | manifest / qc-report / 验收报告 |
| 3E-5 | 可选真实渲染复测 | 待执行 | 至少 1 条真实 MP4，需浏览器环境 |
| 3E-6 | GitHub CI 真 runner 复测 | 阻断 | 等待账号 billing / spending limit 恢复 |
| 3E-7 | PR 状态切换 | 未开始 | CI 绿后从 draft 转 ready |

## 3E 验收策略

3E 的验收分成两类：

| 类型 | 是否依赖 GitHub Billing | 当前处理方式 |
| --- | --- | --- |
| 本地链路验收 | 否 | 由 `npm run acceptance:3e` 执行 |
| GitHub Actions 验收 | 是 | 等账号侧恢复后重跑 CI |

本地链路验收先覆盖三条主线：

- 真实封面查询：能查到就缓存，查不到必须降级不中断。
- 自动卡点：对示例 WAV 生成切点 JSON。
- 批量生产：对示例批量数据执行 dry-run，并生成 manifest / qc-report。

真实 MP4 渲染作为可选项，不默认执行。需要浏览器环境时使用：

```powershell
cd book-intro-maker
$env:RUN_ACCEPTANCE_RENDER='1'
npm.cmd run acceptance:3e
```

## 阶段提交规则

每完成一个明确阶段，都要做四步：

1. 本地更新代码或文档。
2. 执行与该阶段匹配的最小验证。
3. 提交本阶段成果。
4. 上传到 GitHub PR 分支，并回读远端确认。

当前 PR 分支：

```text
claude/shipinmubam-handoff-avn529
```

当前 PR：

```text
https://github.com/bri12afdsarker96-lgtm/ShipinMUBAN/pull/2
```

## 不提交的内容

以下内容是运行产物，只用于本地验收，不提交入库：

- `book-intro-maker/out/`
- `book-intro-maker/config/*.resolved.json`
- `book-intro-maker/public/covers/*`
- `book-intro-maker/gui/dist/`

## 下一步

本阶段已经完成 3E-1 到 3E-4 的第一轮本地验收：

| 验收项 | 结果 |
| --- | --- |
| 验收入口 | `npm run acceptance:3e` 可运行 |
| 真实封面查询 | 当前网络下 Open Library / Google Books 均 `fetch failed`，4 本书降级 placeholder |
| 自动卡点 | 示例音频生成 14 个切点 |
| 批量 dry-run | 示例批量数据 3 条全部 `qc-passed` |
| 综合状态 | `passed-with-followups` |

下一步优先处理两件事：

1. 账号侧恢复 GitHub Billing / spending limit 后，重跑 CI，确认真实 runner 完整 11 项回归。
2. 有浏览器环境时设置 `RUN_ACCEPTANCE_RENDER=1`，用同一条验收入口补 1 条真实 MP4 渲染记录。

若 GitHub Billing 已恢复，则继续执行 3E-6；否则保持 PR draft，不进入 ready for review。
