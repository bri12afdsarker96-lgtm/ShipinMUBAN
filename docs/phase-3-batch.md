# 阶段三（第一版）：批量生产引擎

三阶段目标是产品化与批量生产。第一版先落地**批量生产引擎（命令行）**，它是
`docs/phase-3-plan.md` 里明确的启动条件方向，纯 Node 即可端到端跑通，不依赖
GUI/Electron，为后续可视化界面提供后端能力。

## 能力

- **批量导入**：CSV / JSON，一行 / 一项 = 一条视频。
- **自动卡点**：省略 `flashCutFrames` 时按默认节奏自动生成；指定 `beatsAudio` 时按**音乐瞬态自动检测**切点（见「自动卡点」）。
- **渲染队列**：一次打包、队列渲染，支持并发上限与单条失败重试。
- **自动质检**：渲染前检查必填、字幕溢出、卡点、封面缺失；渲染后校验输出文件。
- **输出归档**：每次任务归档到独立目录，写 `manifest.json` 与 `qc-report.json`。

## 用法

```bash
# JSON 输入
node scripts/batch/render-batch.mjs --input config/batch/sample.json

# CSV 输入，2 条并发，失败重试 2 次
node scripts/batch/render-batch.mjs --input config/batch/sample.csv --concurrency 2 --retries 2

# 只导入 + 质检，不渲染（快速校验数据）
node scripts/batch/render-batch.mjs --input config/batch/sample.json --dry
```

参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--input <file>` | 必填 | `.json` 或 `.csv` |
| `--out <dir>` | `out/batch` | 输出根目录 |
| `--concurrency <n>` | `1` | 批量并发条数 |
| `--retries <n>` | `2` | 单条失败重试次数 |
| `--limit <n>` | 全部 | 只处理前 n 条 |
| `--browser <path>` | 环境变量 `BROWSER_EXECUTABLE` | 浏览器可执行文件；留空则由 Remotion 自动查找（Windows 上通常是本机 Chrome） |
| `--dry` | 关 | 只导入 + 质检，不渲染 |

## 输入字段

一行可以用**扁平字段**（CSV 常用），也可以直接给**结构化三件套**（JSON 常用，
带 `books` / `subtitles` / `intro` 键则直接透传，对应 `config/*.example.json` 结构）。

扁平字段列名：

| 字段 | 说明 |
| --- | --- |
| `id` | 输出文件名 / 任务标识（省略则自动编号） |
| `template` | 模板风格 id：`classic` / `healing` / `quote` / `drama`（省略默认 `classic`，见「模板库」） |
| `mainTitle` `mainAuthor` `mainIsbn` | 主书信息 |
| `mainCover` `mainBackground` | 主封面 / 主背景本地覆盖路径（相对 `public/`） |
| `mainZh` `mainEn` | 主书中英主字幕 |
| `flashBooks` | 快闪书单：`书名~作者~isbn`，多本用 `\|` 分隔，作者/isbn 可省略 |
| `flashCutFrames` | 快闪切点：`134\|139\|144…`（省略则按默认节奏自动生成） |
| `introMode` | `generated`（生成式背景）或 `video`（本地视频） |
| `introVideo` `introTrimStart` `introTrimEnd` `introVolume` `introMuted` | 开场视频参数 |
| `showSubtitles` | 是否显示字幕轨道 |
| `subtitles` | 字幕：`开始帧~结束帧~中文~英文~位置`，多条用 `;` 分隔 |
| `beatsAudio` | 自动卡点音频路径（可配 `beatsStart` / `beatsEnd` / `beatsMax` / `beatsSensitivity`），检测结果覆盖 `flashCutFrames` |

示例见 `book-intro-maker/config/batch/sample.json` 与 `sample.csv`，各含不同书籍主题
（名著推荐、成长治愈、文学金句、诗集、推理等）。

## 输出归档

```text
out/batch/<时间戳>/
  videos/<id>.mp4        每条视频
  manifest.json          任务汇总：每条状态、耗时、大小、重试、质检结果
  qc-report.json         质检明细
```

`manifest.summary` 统计各状态数量：`rendered` / `failed` / `qc-failed` / `qc-passed`（dry）。

## 质检分级

- **error**：阻断渲染（如主书标题为空），该条标记 `qc-failed`。
- **warning**：记录但继续（如字幕估算溢出、卡点非递增）。
- **info**：提示（如封面缺失——会自动降级为生成式占位封面，不影响出片）。

## 模板库

同一套模板代码按 `template` 字段选取一组视觉令牌（`src/templates.ts`），渲染出可辨识的
不同风格。当前内置四套（覆盖 phase-3-plan 的模板类别）：

| id | 风格 | 特征 |
| --- | --- | --- |
| `classic` | 名著推荐 / 默认 | 书脊背景、冷金强调、衬线 |
| `healing` | 成长治愈 | 暖橘柔光、大圆角、暖白文字 |
| `quote` | 文学金句 | 纸质浅底 + 横线、金句式封面卡、深色衬线 |
| `drama` | 短剧感开场 | 高对比黑红斜切、直角卡、亮黄金句、强暗角 |

模板只影响视觉（字体、配色、圆角、背景、卡片样式、暗角、文字色），不改变卡点节奏与
数据结构。新增模板：在 `src/templates.ts` 的 `TEMPLATES` 注册一组令牌即可。

## 自动卡点（音乐瞬态检测）

`scripts/detect-beats.mjs` 解码音频（WAV，`scripts/lib/audio/`）、用能量新颖度法检测瞬态，
生成贴合音乐的快闪切点：

```bash
node scripts/detect-beats.mjs --audio public/sample-beat.wav --start 4 --end 7 --max 14
# -> flashCutFrames: [133,141,146,150,155,160,164,169,172,178,181,187,190,195]
```

参数：`--audio` `--fps` `--start/--end`（秒，限定区间）`--max`（按强度取前 n）
`--min-gap`（相邻最小间隔秒）`--sensitivity`（阈值灵敏度）`--out`（写 JSON）`--print`。

批量中给某条加 `beatsAudio` 即在渲染前自动检测覆盖 `flashCutFrames`（检测过少则保留原值）。
对样片节拍音频，检测结果与 `docs/analysis.md` 中人工逐帧标注的切点几乎逐点吻合（误差 ≤1 帧），
优于原先"约 0.10 秒内"的目标。

## 与前序阶段的关系

- 复用二阶段的配置结构与模板：批量入口 composition `BookIntroFromConfig` 接收原始
  三件套 props，内部用 `propsFromRaw` 构建，映射逻辑不重复。
- 复用封面缓存：先跑 `npm run covers` 下载真实封面到 `public/covers/`，批量渲染即会
  自动使用；缺封面时降级，渲染不中断。

## 后续（阶段三待办）

- 可视化编辑界面（React + 本地服务，Electron/Tauri 封装）。
- 素材库管理（封面 / 背景 / 开场视频 / 音乐 / 字幕样式统一登记与引用）。
- 渲染队列的暂停 / 恢复 / 失败归因面板。

已完成：批量生产引擎、模板风格库、音乐瞬态自动卡点检测。
