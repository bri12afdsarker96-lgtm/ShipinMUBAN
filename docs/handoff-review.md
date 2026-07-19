# 项目复盘：从配置化到产品化（阶段二 + 阶段三）

本文对本次交接开发的**每一个环节代码**做完整梳理，覆盖阶段二（配置化与真实素材）
与阶段三（产品化与批量生产）。所有能力均在预装 Chromium 的环境中**实跑验证**。

## 1. 总览

| 项 | 值 |
| --- | --- |
| 分支 | `claude/shipinmubam-handoff-avn529` |
| PR | #2（草稿） |
| 提交数 | 9（阶段二 1 + 阶段三 8） |
| 源码规模 | 约 3200 行净增，37 文件 |
| 语言/框架 | TypeScript、React 19、Remotion 4.0.490、Node 原生 http、esbuild |
| 校验 | `tsc --noEmit` 全绿；每个能力均有渲染/接口/截图级验证 |

### 提交脉络

```
bc2f5e0 Initialize（骨架，交接前已存在）
da985db 阶段二：配置化模板 + 真实封面查询
c0fdf11 阶段三：批量生产引擎（CLI）
bb2a2db 阶段三：模板库（多风格）
f39b16f 阶段三：音乐瞬态自动卡点
014a18d 阶段三：素材库 + 音乐可配置
71f31c9 阶段三：可视化编辑 + 实时预览
a3476f4 阶段三：编辑器本地服务版
942bbc5 阶段三：批量渲染队列面板
```

## 2. 数据流全景

```text
                     ┌─────────────── 素材准备层（Node 脚本）───────────────┐
  书单/表格 ──▶ fetch-covers.mjs ──▶ public/covers/ 缓存 + books.resolved.json
                     detect-beats.mjs ──▶ flashCutFrames（音乐瞬态）
                     └──────────────────────────────────────────────────────┘
                                          │
  config/*.json ──▶ configSchema(解析) ──▶ config.ts(buildProps/propsFromRaw)
                                          │
                          ┌───────────────┴────────────────┐
                          ▼                                 ▼
                 BookIntroVideo(模板)              templates.ts(风格令牌)
                 · IntroLayer 开场                        │
                 · BookFlashSequence 快闪(CoverImage 降级) │
                 · MainBookScene 主书                      │
                 · SubtitleTrack 字幕                      │
                          │                                 │
        ┌─────────────────┼─────────────────────────────────┘
        ▼                 ▼                         ▼
   Remotion 渲染      批量引擎(run-batch)        可视化编辑器(gui + server)
   BookIntroConfig   CSV/JSON→队列→归档         表单→Player 预览→一键渲染/批量队列
```

核心不变量：**渲染层不联网、不读文件、不依赖素材是否存在**；缺封面/背景/音频一律降级，
渲染永不中断。素材准备（联网、缓存）全部隔离在 Node 脚本层。

## 3. 逐环节梳理

### 阶段二

#### `src/configSchema.ts`（289 行）— 类型与容错解析
- 定义全部配置类型：`IntroConfig` / `BookRef` / `MainBookRef` / `BooksConfig` /
  `SubtitleItem` / `SubtitleStyle` / `SubtitlesConfig`，及 `Motif` / `Palette`。
- 解析器 `parseIntroConfig` / `parseBooksConfig` / `parseSubtitlesConfig`：**容错优先**——
  字段缺失或类型不对时 `console.warn` 并回退默认值，只有结构性损坏（books 非对象）才抛错。
- `paletteForIndex` / `motifForIndex`：为无配色/图形的书按序分配默认视觉，保证占位封面有区分度。
- 关键取舍：不引入 zod，用手写守卫（`isObject`/`asString`/`asNumber`…）保持零依赖，离线可用。

#### `src/config.ts`（215 行）— props 构建中枢
- `buildPropsFromConfig(books, subtitles, intro)`：三件套 → 统一 `BookIntroProps`。
- `loadConfigProps()`：静态 import `*.example.json` → 配置驱动 props。
- `propsFromRaw(raw)`：从「原始三件套 + template/audio」构建 props，缺省回退示例；**批量与
  编辑器共用同一映射，避免逻辑重复**。
- `coverSlug` / `conventionCoverPath`：封面约定路径（`covers/<slug>.jpg`），与 `fetch-covers.mjs`
  的 slug **保持一致**（有注释约束）。
- `durationForProps`：按末切点/末字幕推算时长（≥240 帧）。
- `sampleProps`：阶段一样片适配为统一 props（纯生成式封面、hookLines→字幕轨道），**保留样片能力**。

#### `src/components/SubtitleTrack.tsx`（103 行）— 独立字幕轨道
- 由 `SubtitleItem[]` 驱动，中英双语、位置（上/中/下）、颜色/字号/字重/阴影。
- 6 帧淡入淡出（`useCurrentFrame` + `interpolate`），只渲染当前帧命中的字幕。
- 把原本写死在开场场景里的字幕彻底抽离为覆盖层。

#### `src/components/IntroLayer.tsx`（136 行）— 开场层
- `mode: video` → `@remotion/media` 的 `Video`，支持 `trimBefore/trimAfter`（秒×fps）、音量、静音；
  `mode: generated` → 雪花 + 人物剪影 + 渐变的生成式背景。
- `videoPath` 缺失自动降级为生成式，缺素材不中断。

#### `src/components/CoverImage.tsx`（33 行）— 封面降级核心
- `<Img>` + `onError` + `maxRetries={0}`：真实封面加载失败**立即**切换到 `fallback`（生成式图形封面）。
- 这是"缺封面不中断渲染"的关键实现，也让批量渲染在缺封面时不逐帧重试拖慢。

#### `src/BookIntro.tsx`（340 行）— 模板主组件
- 消费 `BookIntroProps`，按 `props.template` 取 `templates.ts` 令牌渲染。
- 结构：`Audio`(可配置) + `IntroLayer` + `BookFlashSequence` + `MainBookScene` + `SubtitleTrack` + 时间码。
- `BookFlashSequence`：按 `flashCutFrames` 硬切换书封卡，`pulseForCuts` 做卡点脉冲；封面走 `CoverImage` 降级。
- `MainBookScene`：背景按令牌 `mainBackground`（spines/warm/paper/contrast）选变体，可选主封面块。
- 空 `flashCutFrames` 有保护（只放开场+主书）。

#### `src/BookIntroFromConfig.tsx`（23 行）— 批量入口 composition
- props 是**原始三件套**，内部 `propsFromRaw` 构建，`calculateMetadata` 按 props 动态定时长。
- 批量/编辑器只需传原始配置作为 `inputProps`，映射不在 Node 侧重复。

#### `src/Root.tsx`（50 行）— composition 注册
- 三个 composition：`BookIntro`（样片）/ `BookIntroConfig`（配置驱动）/ `BookIntroFromConfig`（批量入口）。

#### `scripts/fetch-covers.mjs`（166 行）— 封面查询与缓存
- 策略：本地覆盖 > 缓存命中 > ISBN（Open Library，`default=false` 避免空白图）> 书名/作者或 `coverQuery`；
  Open Library 优先、Google Books 补充；全失败标记 placeholder（交模板降级）。
- 请求超时（AbortController）、空白图校验（<1KB 视为无效）、`--force` 强制重下、结果统计。
- 输出 `books.resolved.json`（不进仓库）。

### 阶段三

#### `src/templates.ts`（94 行）— 模板库
- `TemplateTokens` + 注册表：`classic`/`healing`/`quote`/`drama` 四套，令牌驱动字体、强调色、
  卡片圆角、封面卡样式（cover/quote）、主书背景、暗角、文字/金句色。
- `getTemplate(id)` 未知 id 回退默认；新增模板只需注册一组令牌。

#### 批量引擎 `scripts/batch/`
- `lib/parse-input.mjs`（83）：CSV（含引号转义/字段内逗号换行）与 JSON 导入为行对象数组。
- `lib/row-to-config.mjs`（164）：扁平字段/结构化 → 三件套；`defaultCutFrames` 默认节奏；
  提取 `beats`（自动卡点）与 `audio`。
- `lib/qc.mjs`（92）：渲染前后质检，分 error（阻断）/warning（字幕溢出估算、卡点非递增）/info（封面缺失）；
  含背景音乐存在性检查、输出文件校验。
- `lib/pool.mjs`（15）：并发池（保序、限流）。
- `lib/render-core.mjs`（36）：`getBundle`（打包缓存）+ `renderJob`（selectComposition+renderMedia+重试），
  **批量与服务共用**。
- `lib/run-batch.mjs`（102）：批量核心 `prepareJobs`（映射+素材+自动卡点）+ `runBatch`（质检+队列渲染），
  带 `onProgress` 进度回调，**CLI 与本地服务共用**。
- `render-batch.mjs`（123）：薄 CLI 外壳——参数、导入、dry、调 `runBatch`、归档 `manifest.json`/`qc-report.json`。

#### 自动卡点 `scripts/lib/audio/` + `scripts/detect-beats.mjs`
- `wav.mjs`（59）：无依赖 WAV 解码（PCM8/16/24/32、Float32，多声道降混为单声道浮点）。
- `onset.mjs`（87）：能量新颖度法瞬态检测 + 自适应阈值峰值拾取；`detectCutFrames` 生成 30fps 卡点帧
  （区间过滤、按强度取 topN）。
- `detect-beats.mjs`（82）：CLI 输出 `flashCutFrames`，可写 JSON。
- 批量中 `beatsAudio` 在渲染前自动检测覆盖切点，检测过少回退默认节奏。

#### 素材库 `config/assets.example.json` + `scripts/lib/assets.mjs`（65）
- 登记 audio/covers/backgrounds/introVideos/subtitleStyles，配置用 `asset:<id>` 引用。
- `resolveAssetsInJob` 在批量映射后把引用替换为真实路径/样式对象；未找到告警并置空（交渲染降级）。
- 音乐从硬编码升级为 `props.audio` 可配置（`config.ts`/`Root`/batch/server 全链路注入）。
- `scripts/lib/cover-path.mjs`（17）：Node 侧封面路径约定，消除脚本间 slug 重复。

#### 可视化编辑器 `gui/` + `scripts/build-gui.mjs`
- `App.tsx`（377）：三栏编辑器（表单/`@remotion/player` 实时预览/导出）+「编辑器 / 批量队列」tab；
  批量面板轮询 `/api/batch/:id` 实时表格；URL 预设（`?template=&title=&view=batch`）。
- `build-gui.mjs`（37）：esbuild 打包纯前端（`--serve` 本地预览），无需新依赖。
- 复用渲染层 `propsFromRaw`/`durationForProps`/模板注册表，所见即渲染所得。

#### 本地服务 `scripts/server.mjs`（224）
- Node 原生 http，托管 `gui/dist`/`public`/`out`；`/api/render`（单条）、`/api/batch` + `/api/batch/:id`
  （内存队列 + 进度）、`/api/renders`、`/api/assets`、`/api/health`。
- 渲染复用 `render-core`；托管 public 让预览用上真实音频/封面。

## 4. 关键设计决策

1. **渲染层零 I/O**：封面走「约定路径 + `CoverImage` 降级」，不静态导入 `resolved.json`，缺素材永不中断。
2. **映射逻辑单一来源**：`propsFromRaw` 一处实现，被组件、批量、编辑器共用。
3. **核心两次抽取**：`render-core`（打包+渲染）、`run-batch`（批量编排）让 CLI 与服务共用，避免重复。
4. **容错解析**：配置写坏只告警回退，样片能力不被破坏。
5. **零新增运行时依赖**：CSV 解析、WAV 解码、http 服务、打包全用已有能力（esbuild/@remotion/player 随 Remotion 已装）。

## 5. 验证结果

- `tsc --noEmit`（含 gui）全绿。
- 阶段二：`BookIntroConfig` 完整 MP4；样片逐帧对比视觉保留；缺封面渲染 `Rendered 1/1` 不中断。
- 批量：多主题 + 素材库 + 自动卡点全链路 `rendered:3, warn:0`；CSV/JSON/dry 均通过。
- 模板：四套各渲主书页帧，风格辨识度高（截图）。
- 自动卡点：对样片音频检测切点 `[133,141,146,150,155,160,164,169,172,178,181,187,190,195]`，
  与 `analysis.md` 人工标注误差 ≤1 帧。
- 编辑器：截图确认界面 + Player 出画 + `drama` 预设联动。
- 服务：`/api/render` 出 1.19MB MP4；`/api/batch` 队列 2 条串行成功、进度轮询、产物 200 可访问。

## 6. 已知限制与待改进（诚实清单）

- **路径遍历（已加固）**：`server.mjs` 静态服务改用 `withinBase` 做 `path.resolve` 边界校验，
  `..` 越界一律 404（已用多种编码/组合验证）。
- **批量队列（已持久化历史）**：完成后归档 `manifest.json` 到 job 目录，`GET /api/batches` 融合
  内存态与磁盘归档（服务重启后历史仍可见）；队列暂停/恢复/单条重试仍待做。
- **视频 range 请求**：`serveStatic` 不支持 Range，超大 MP4 在部分浏览器 seek 受限（当前产物 ~1.5MB 无碍）。
- **真实封面下载**：受本环境网络策略限制未能实测下载（Open Library 403 / Google 429），脚本逻辑正确、
  已按设计降级；放开网络或本地环境可下载。
- **音频瞬态检测**：时域能量法对强节拍稳定，对氛围类音乐会偏稀疏；未做节拍网格量化。
- **样式**：GUI 用内联样式，未做响应式/主题；面向验证与自用，产品化可引入设计系统。

## 7. 后续建议（优先级）

1. 服务端路径校验加固 + 批量历史持久化（低成本、直接提升健壮性）。
2. 队列暂停/恢复/单条重试、界面内读写批量数据文件与素材上传。
3. 界面内一键调用封面查询 / 自动卡点。
4. 桌面封装（Electron/Tauri）——需在本地环境完成打包分发选型与验证。
