# 后续阶段立项与执行台账

更新时间：2026-07-19

## 总目标

将 ShipinMUBAN 从当前的阶段三 Beta 候选分支，推进为可合并、可验收、可继续产品化的本地视频模板软件。

这份台账用于回答三个问题：

1. 后续每个阶段到底要交付什么。
2. 每个阶段完成到什么程度才算结束。
3. 每完成一个阶段如何提交并上传到 GitHub。

## 当前执行阶段

当前正式立项的执行阶段是 **阶段 3E：合并前验收**；在 3E 被 GitHub Billing 与第三方封面源阻断期间，
同步推进不依赖外部账号状态的阶段四产品化小步快跑。

阶段 3E 不以新增大功能为主，而是把已经完成的阶段二、阶段三能力跑通、验明、归档，确认 PR #2 可以从 draft 推进到 ready for review。

## 阶段闸门

| 阶段 | 状态 | 目标 | 完成标准 |
| --- | --- | --- | --- |
| 3E | 进行中 | 合并前验收 | CI 真跑绿；真实素材验收有记录；PR #2 可转 ready |
| 4A | 第二版完成，逐本封面入口补齐 | 素材管理产品化 | 界面内选择/上传封面、音乐、背景、开场视频，无需手写路径 |
| 4B | 进行中，封面与卡点第一版完成 | 封面与卡点一键化 | 界面内触发封面查询、自动卡点，并能预览结果 |
| 4C | 第一版完成 | 队列控制 | 支持暂停、恢复、单条重试、失败原因展示 |
| 4D | 待立项 | 视觉验收 | 自动导出关键帧截图，便于人工检查遮挡、错位、字幕溢出 |
| 5A | 第一版完成 | 桌面封装选型 | 已生成 NSIS 引导安装包，目录版 Windows 客户端可启动 |
| 5B | 待立项 | 分发包与示例工程 | 非开发机器可安装，示例工程可打开、预览、渲染 |

## 3E 任务包

| 编号 | 任务 | 状态 | 交付物 |
| --- | --- | --- | --- |
| 3E-1 | 建立合并前验收脚本入口 | 已完成 | `npm run acceptance:3e` |
| 3E-2 | 真实封面链路复测 | 已完成，需后续复测真实下载 | `out/acceptance/3e/*/acceptance-report.json` |
| 3E-3 | 自动卡点链路复测 | 已完成 | 切点 JSON 与验收报告 |
| 3E-4 | 批量 dry-run 复测 | 已完成 | manifest / qc-report / 验收报告 |
| 3E-5 | 可选真实渲染复测 | 已完成 | 至少 1 条真实 MP4，需浏览器环境 |
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
- `book-intro-maker/public/backgrounds/*`
- `book-intro-maker/public/intro-videos/*`
- `book-intro-maker/public/audio/*`
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

封面链路已补充代理回退诊断：当前 Windows 用户代理为 `127.0.0.1:18483`，Node 直连会超时；
脚本现在可通过 curl 走 `COVER_PROXY` / 系统用户代理。重跑后失败原因变为 Open Library 封面图
`503` 或超时、Google Books `429`，说明脚本代理链路已打通，但第三方封面源在当前网络出口下仍不可用。

已完成 3E-5 真实 MP4 渲染验收：

| 验收项 | 结果 |
| --- | --- |
| 执行方式 | `RUN_ACCEPTANCE_RENDER=1 npm run acceptance:3e` |
| 渲染结果 | `classics-night` 1 条视频 `rendered` |
| 视频参数 | 720x1280，约 8.43 秒，约 1.57MB，含音频轨 |
| 画面抽帧 | 5.5 秒抽帧非黑屏，缺真实封面时显示生成式封面 |
| 综合状态 | `passed-with-followups` |

下一步优先处理两件事：

1. 账号侧恢复 GitHub Billing / spending limit 后，重跑 CI，确认真实 runner 完整 11 项回归。
2. 在网络稳定或代理环境下重跑封面查询，争取让真实封面链路不再全部降级。

若 GitHub Billing 已恢复，则继续执行 3E-6；否则保持 PR draft，不进入 ready for review。

## 4A 第一版：主书封面上传

在 3E 仍受真实封面源和 GitHub Billing 阻断时，先推进不依赖外部服务的素材兜底能力。

| 项目 | 结果 |
| --- | --- |
| 服务端 | 新增 `POST /api/assets/upload`，支持上传 jpg/png/webp 到 `public/covers/` |
| 编辑器 | 主书表单新增本地封面路径和上传按钮 |
| 配置输出 | 上传成功后写入 `books.mainBook.coverPath`，可用于预览、导出和渲染 |
| 静态服务 | 支持 `/covers/...` 与 `/public/covers/...` 两种访问路径 |
| 阶段状态 | 4A 第一版完成，主书封面可本地替换 |

验证结果：

- `npm.cmd run gui:build` 通过。
- `POST /api/assets/upload` 实测上传 68B png，返回 `covers/...png`。
- `/covers/...` 与 `/public/covers/...` 均可访问，HTTP 200。
- `npm.cmd test` 通过 6 项，未设浏览器时渲染集成项按既有规则跳过。

## 4A 第二版：全画面素材可替换

用户明确要求：快闪书单素材也需要可以替换，模板素材也需要可替换，凡是视频中展现出来的素材都需要是可替换的。
本阶段把素材替换从“主书封面”扩展到开场、快闪段、主书页和声音层。

| 项目 | 结果 |
| --- | --- |
| 服务端上传 | `POST /api/assets/upload` 扩展支持 `covers`、`backgrounds`、`introVideos`、`audio` |
| 快闪书单 | 编辑器每行支持 `书名 | 作者 | 封面路径`，并提供逐本封面预览、路径输入和单独上传按钮；也可多选图片按行写入快闪封面 |
| 模板/场景背景 | 新增 `visualAssets.flashBackgroundPath`，快闪段背景可替换；主书背景写入 `books.mainBook.backgroundPath` |
| 开场素材 | 开场视频 `intro.videoPath`、生成式开场背景 `intro.backgroundPath`、开场角标 `intro.brandText` 均可配置 |
| 音乐素材 | 背景音乐可在界面上传到 `public/audio/`，并写入顶层 `audio` |
| 批量数据 | `row-to-config` 支持 `flashBackground`、`introBackground`、`introBrand`、`flashBooks` 第 4 段封面路径 |
| 防误提交 | 新增 `public/backgrounds/`、`public/intro-videos/`、`public/audio/` 占位目录，真实上传素材默认忽略 |
| 阶段状态 | 4A 第二版完成；当前仍保留生成式降级，缺图片背景时不阻断渲染 |

验证结果：

- `node --check` 通过：`scripts/server.mjs`、`scripts/batch/lib/row-to-config.mjs`、`scripts/lib/assets.mjs`、`scripts/test-regressions.mjs`。
- `npx.cmd tsc --noEmit` 通过。
- `npm.cmd run gui:build` 通过。
- `npm.cmd test` 通过 15 项，新增覆盖背景图、音乐、开场视频上传类型。
- 接口冒烟：上传背景图与快闪封面后，批量配置可接收 `visualAssets.flashBackgroundPath`、`books.mainBook.backgroundPath`、`intro.backgroundPath` 与快闪封面路径，质检只因故意留空主书标题而失败。

补充完成：快闪书单不再只依赖文本第三列，每本书在编辑器内都有独立的封面预览、路径输入和上传入口，明确满足“快闪书单封面素材可替换”。

## 4B 第一版：界面内自动卡点

| 项目 | 结果 |
| --- | --- |
| 服务端 | 新增 `POST /api/beats/detect`，复用 WAV 解码与瞬态检测 |
| 编辑器 | 背景音乐下新增快闪切点帧输入框和自动卡点按钮 |
| 配置输出 | 自动卡点结果写入 `books.flashCutFrames` |
| 阶段状态 | 4B 卡点第一版完成；封面查询能力见 4B 第二版 |

验证结果：

- `npm.cmd run gui:build` 通过。
- `POST /api/beats/detect` 对 `sample-beat.wav` 返回 14 个切点：
  `[133,141,146,150,155,160,164,169,172,178,181,187,190,195]`。
- `npm.cmd test` 通过 6 项，未设浏览器时渲染集成项按既有规则跳过。

## 4B 第二版：界面内封面查询

| 项目 | 结果 |
| --- | --- |
| 公共模块 | 抽出 `scripts/lib/covers.mjs`，CLI 与服务端共用同一套封面查询/代理回退/降级逻辑 |
| 服务端 | 新增 `POST /api/covers/lookup`，支持单本书封面查询与缓存 |
| 编辑器 | 主书封面区域新增查询按钮 |
| 当前验收边界 | 当前环境只能验证降级路径；真实封面下载仍受第三方源 `503`/`429` 影响 |

验证结果：

- `npm.cmd run gui:build` 通过。
- `npm.cmd run covers -- --force` 使用公共模块后仍保持降级链路正常。
- `POST /api/covers/lookup` 对 `The Great Gatsby` 返回 `coverSource=placeholder`、3 条 warning，服务继续存活。
- `npm.cmd test` 通过 6 项，未设浏览器时渲染集成项按既有规则跳过。

## 4C 第一版：批量队列控制

| 项目 | 结果 |
| --- | --- |
| 批量核心 | `runBatch` 新增暂停等待点与 `indexOffset`，单条重试可写回原行号 |
| 服务端 | 新增 `POST /api/batch/:id/pause`、`resume`、`retry`，队列状态返回 `paused/status/retrying/waitingIndex` |
| 编辑器 | 批量队列页新增暂停、恢复、单条重试按钮，并单独展示失败原因 |
| 归档 | `manifest.json` 增加队列 `status`，重试后仍按整批 records 归档 |
| 阶段状态 | 4C 第一版完成；当前暂停为“当前条跑完后暂停下一条”，不强杀正在渲染的 MP4 |

验证结果：

- `node --check` 通过：`scripts/batch/lib/run-batch.mjs`、`scripts/server.mjs`、`scripts/test-regressions.mjs`。
- `npx.cmd tsc --noEmit` 通过。
- `npm.cmd run gui:build` 通过。
- `npm.cmd test` 通过 12 项，新增覆盖队列等待点、失败原因返回、单条重试写回原记录。
- 接口冒烟：启动 2 条质检失败任务后，`pause` 返回 `paused=true/status=paused`，`resume` 返回 `paused=false`，最终两条均为 `qc-failed` 且失败原因均为“主书标题为空”。

## 5A 第一版：桌面封装与安装包配置

| 项目 | 结果 |
| --- | --- |
| 软件名称 | `水星视频模板` |
| 桌面壳 | 新增 Electron 主进程，启动时自动打开本地编辑器服务 |
| 安装包 | 新增 `electron-builder` NSIS 引导式安装包配置，可选安装目录、创建桌面/开始菜单快捷方式 |
| UI 风格 | 参考“水星下载”，改为深色左侧导航、右侧工作区、顶部主操作按钮 |
| 签名策略 | 第一版关闭 `signAndEditExecutable`，先产出未签名安装包，避免本机无符号链接权限时卡在 winCodeSign |
| 阶段状态 | 第一版完成，已产出引导安装包 |

验证结果：

- `npm.cmd run gui:build` 通过。
- `package-lock.json` 已记录 Electron / electron-builder 依赖。
- `npm.cmd run electron:install` 通过镜像下载 Electron 运行时。
- `npm.cmd run pack:win` 生成目录版客户端 `release/win-unpacked/水星视频模板.exe`。
- `npm.cmd run dist:win` 生成引导安装包 `release/水星视频模板-Setup-0.2.0.exe`。
- 安装包大小 134,887,754 bytes，SHA256 `8CC1FD4DF19053BB0FA2F369964D068F46FE7C5F0CFDACC8296AB60C1E8B6745`。
- 目录版客户端启动验收通过，`http://127.0.0.1:43110/api/health` 返回 `{"ok":true}`。
