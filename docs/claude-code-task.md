# Claude Code 初步开发任务

## 背景

这是一个书籍类竖屏短视频模板生成器。阶段一已经完成 Remotion MVP。现在需要进入阶段二：配置化和真实书封查询。

请先阅读：

1. `README.md`
2. `docs/requirements.md`
3. `docs/phase-2-spec.md`
4. `docs/architecture.md`
5. `CLAUDE.md`

## 初步任务

### 任务 1：配置读取

在 `book-intro-maker/src` 中新增配置读取与类型定义，让 Remotion 模板不再直接依赖 `samplePreset` 写死数据。

建议输出：

- `src/config.ts`
- `src/configSchema.ts`
- 支持读取 `config/books.example.json`、`config/subtitles.example.json`、`config/intro.example.json`。

### 任务 2：字幕轨道组件

把当前写在场景内的字幕逻辑抽成通用字幕组件。

建议输出：

- `src/components/SubtitleTrack.tsx`
- 支持中英双语、位置、颜色、字号、阴影。

### 任务 3：真实封面查询脚本

实现 `scripts/fetch-covers.mjs`。

要求：

- 优先 Open Library。
- 补充 Google Books。
- 支持 `coverPath` 本地覆盖。
- 下载到 `public/covers/`。
- 输出解析后的书籍配置，例如 `config/books.resolved.json`。

### 任务 4：开场视频替换

新增开场视频组件，支持本地视频路径、裁剪、音量、静音。没有视频时使用默认生成背景。

建议输出：

- `src/components/IntroLayer.tsx`

## 验收命令

```powershell
cd book-intro-maker
npm.cmd install
npm.cmd run studio
npm.cmd run render
```

## 注意

- 不要提交 `node_modules`、`out`、下载的封面缓存。
- 保留阶段一的默认样片能力。
- 找不到真实封面时必须降级到生成式占位封面，不能中断渲染。
