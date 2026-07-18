# 阶段三：可视化编辑器

面向非开发用户的**可视化编辑 + 实时预览**界面，是三阶段"产品化"的前端入口。

## 运行

```bash
cd book-intro-maker
npm.cmd run gui          # 起本地编辑器，默认 http://127.0.0.1:5173
npm.cmd run gui:build    # 打包到 gui/dist（可静态托管）
```

## 界面

三栏布局：

- **编辑面板**：模板风格（下拉）、背景音乐、主书（书名/作者/中英金句）、快闪书单
  （每行一本 `书名 | 作者`）、开场字幕、字幕开关、开场模式。
- **实时预览**：`@remotion/player` 内嵌预览，改任意字段即时重渲，默认停在主书页。
- **导出配置**：把当前设置导出为 JSON，可直接作为批量数据的一项喂给 `render-batch`。

支持 URL 预设，便于分享带初始内容的链接：
`?template=drama&title=东方快车谋杀案&author=阿加莎&zh=真相只有一个`。

## 技术

- 纯前端，`esbuild` 打包（`scripts/build-gui.mjs`），无需后端服务。
- **复用渲染层**：预览用的 composition（`BookIntroFromConfig`）、`propsFromRaw`、
  `durationForProps`、模板注册表都直接 import 自 `src/`，界面所见即渲染所得。
- 表单 → 原始三件套配置 → `Player` 的 `inputProps`，与批量引擎的数据结构完全一致。

## 与批量引擎的关系

```text
可视化编辑器  --导出配置 JSON-->  批量数据(.json)  -->  render-batch  -->  MP4
```

编辑器负责"单条可视化调参 + 预览"，批量引擎负责"多条自动化出片"，两者共享同一套配置结构。

## 后续

- 本地服务版：读写素材库与配置文件、直接触发批量渲染、渲染队列进度。
- 封面查询、自动卡点在界面内一键调用。
- 桌面封装（Electron / Tauri）。
