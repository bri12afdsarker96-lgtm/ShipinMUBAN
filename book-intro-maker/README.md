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

## 设计说明

- 所有动画用 `useCurrentFrame()` + `interpolate()` + 显式帧号，不用 CSS animation。
- 主书页的主字幕（`mainBook.zhLine`/`enLine`）与主书信息绑定，随主书场景渲染；
  开场/快闪等其余字幕由独立的 `SubtitleTrack` 轨道驱动，已从场景中分离。
- 配置解析容错：字段缺失或类型错误时打印告警并退回默认值，样片能力不会被破坏。
