# Book Intro Maker

竖屏（720x1280 / 30fps）书籍类短视频模板生成器。阶段二起，模板由配置文件驱动，
并接入真实书封查询与缓存。

## 两个 Composition

- `BookIntro`：阶段一默认样片，配置写死在 `src/preset.ts`，纯生成式图形封面，
  用于保留最初的卡点验证能力。
- `BookIntroConfig`：阶段二配置驱动，由 `config/*.example.json` 生成，支持真实封面、
  自定义书单、自定义主书、独立字幕轨道、可替换开场视频。

两者共用同一个 `BookIntroVideo` 组件（`src/BookIntro.tsx`）。

## 配置文件

| 文件 | 作用 |
| --- | --- |
| `config/intro.example.json` | 开场层：`video` 用本地视频（可裁剪/音量/静音），`generated` 用生成式背景；`showSubtitles` 控制字幕轨道显隐 |
| `config/books.example.json` | 快闪书单 `flashBooks`、快闪切点 `flashCutFrames`、主书 `mainBook`（书名/作者/ISBN/本地封面/背景/主字幕） |
| `config/subtitles.example.json` | 独立字幕轨道 `tracks`：每条含 `startFrame`/`endFrame`/`zh`/`en`/`position`/`style` |

改配置即可换书单、主书、字幕、开场，无需改代码。

## 代码结构

```text
src/
  configSchema.ts          配置类型与容错解析（缺字段补默认值，不抛错中断）
  config.ts                读取配置、构建模板 props；样片适配
  media.ts                 静态资源路径解析
  BookIntro.tsx            模板主组件（开场 / 快闪 / 主书 / 字幕组合）
  components/
    IntroLayer.tsx         开场层：本地视频 或 生成式背景
    SubtitleTrack.tsx      独立字幕轨道（中英双语、位置、颜色、字号、阴影）
    CoverImage.tsx         封面图片，加载失败降级为生成式图形封面
```

## 封面查询与缓存

```bash
npm.cmd run covers            # 利用缓存（已下载的封面跳过联网）
node scripts/fetch-covers.mjs --force   # 忽略缓存强制重新下载
```

查询策略：本地覆盖 `coverPath` > 缓存命中 > ISBN（Open Library，`default=false` 避免空白图）
> 书名/作者或 `coverQuery`（Open Library 优先，Google Books 补充）> 找不到则标记 placeholder。

- 下载到 `public/covers/`（已在 `.gitignore` 中，不进仓库）。
- 输出解析后配置 `config/books.resolved.json`（同样不进仓库）。
- 模板按「约定路径 + 加载失败降级」接入封面：`public/covers/<slug>.jpg`（slug 与脚本一致），
  文件不存在时 `CoverImage` 自动回退到生成式图形封面，**缺封面/缺网络都不会中断渲染**。
- 如果 Windows 开启了用户代理，脚本会在 Node 直连不可用时通过 curl 走该代理；也可显式设置
  `COVER_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY`。当前验收环境中，代理可用但 Open Library 封面图
  返回 `503` 或超时，Google Books 返回 `429`，因此仍降级为 placeholder。

## 运行

```bash
npm.cmd run studio            # 打开 Remotion Studio
npm.cmd run covers            # 查询并缓存真实封面（可选）
npm.cmd run render            # 导出默认 BookIntro
```

渲染指定配置驱动版本：

```bash
npx remotion render src/index.ts BookIntroConfig out/book-intro-config.mp4
```

> `package.json` 里的默认命令使用 Windows 上的 Chrome 路径（`--browser-executable`）。
> 其他平台请把该参数指向本机的 Chrome / Chromium / chrome-headless-shell 可执行文件。

## 阶段三：批量生产（命令行）

一行数据 = 一条视频，支持 CSV / JSON 批量导入、自动卡点、渲染队列（并发 + 重试）、
自动质检、输出归档。

```bash
# 批量渲染（JSON 或 CSV）
node scripts/batch/render-batch.mjs --input config/batch/sample.json
node scripts/batch/render-batch.mjs --input config/batch/sample.csv --concurrency 2

# 只质检不渲染
node scripts/batch/render-batch.mjs --input config/batch/sample.json --dry
```

输出归档到 `out/batch/<时间戳>/`，含每条 `videos/<id>.mp4`、`manifest.json`、`qc-report.json`。
字段约定与详细用法见 `../docs/phase-3-batch.md`。示例数据在 `config/batch/`。

**模板库**（`src/templates.ts`）：每条数据可用 `template` 字段选风格，内置
`classic`（名著推荐）/ `healing`（成长治愈）/ `quote`（文学金句）/ `drama`（短剧感开场）
四套。模板只改视觉（字体/配色/圆角/背景/卡片/暗角），新增模板在 `TEMPLATES` 注册一组令牌即可。

**自动卡点**（`scripts/detect-beats.mjs`）：解码音频、检测瞬态，生成贴合音乐的快闪切点。

```bash
# 生成书封快闪段(4-7s)的 14 个切点
node scripts/detect-beats.mjs --audio public/sample-beat.wav --start 4 --end 7 --max 14
```

批量数据里给某条加 `beatsAudio`（可配 `beatsStart`/`beatsEnd`/`beatsMax`）即自动检测覆盖
`flashCutFrames`。对样片节拍音频，检测结果与人工逐帧标注的切点几乎逐点吻合（误差 ≤1 帧）。

**素材库**（`config/assets.example.json` + `scripts/lib/assets.mjs`）：统一登记
音乐 / 封面 / 背景 / 开场视频 / 字幕样式，配置用 `asset:<id>` 引用。背景音乐现在可按视频
配置（`audio` 字段），不再硬编码。详见 `../docs/phase-3-batch.md`。

## 可视化编辑器

```bash
npm.cmd run gui                      # 纯前端编辑器 http://127.0.0.1:5173
npm.cmd run gui:build && npm.cmd run server   # 本地服务版 http://127.0.0.1:4000（可一键渲染 MP4）
```

纯前端 React + `@remotion/player`：左侧表单编辑模板/主书/书单/字幕/音乐，中间**实时预览**，
右侧**导出配置 JSON** 直接喂给批量引擎。复用渲染层的 `propsFromRaw`/模板注册表，所见即所得。
**本地服务版**额外支持界面内**一键渲染 MP4** 与**批量队列**（提交多条 → 实时进度/质检/产物链接），
并让预览用上真实音频/封面；主书封面可在界面内上传到 `public/covers/`。支持
`?template=&title=&cover=&view=batch` 等 URL 预设。详见 `../docs/phase-3-editor.md`。

> 非 Windows 环境用 `--browser <path>` 或环境变量 `BROWSER_EXECUTABLE` 指定浏览器。

## 回归测试

```bash
npm.cmd test        # 覆盖三类回归：批量 id 越界/覆盖、books 非对象降级、大请求体 413
```

id 清理与 413 无需浏览器；books 降级与批量渲染断言需设 `BROWSER_EXECUTABLE`（或本机 Chrome），
或设 `RUN_RENDER_TESTS=1` 让 Remotion 使用已安装的无头浏览器。

仓库配 GitHub Actions（`../.github/workflows/ci.yml`）：PR/push 时安装无头浏览器（`remotion browser
ensure`）并跑 `tsc` + **完整 11 项回归**（`RUN_RENDER_TESTS=1`），确保渲染回归不会被静默跳过而假绿。

## 设计说明

- 所有动画用 `useCurrentFrame()` + `interpolate()` + 显式帧号，不用 CSS animation。
- 主书页的主字幕（`mainBook.zhLine`/`enLine`）与主书信息绑定，随主书场景渲染；
  开场/快闪等其余字幕由独立的 `SubtitleTrack` 轨道驱动，已从场景中分离。
- 配置解析容错：字段缺失或类型错误时打印告警并退回默认值，样片能力不会被破坏。
