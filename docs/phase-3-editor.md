# 阶段三：可视化编辑器

面向非开发用户的**可视化编辑 + 实时预览**界面，是三阶段"产品化"的前端入口。

## 运行

两种模式：

```bash
cd book-intro-maker

# A. 纯前端（仅编辑 + 预览 + 导出配置）
npm.cmd run gui          # esbuild 起编辑器，默认 http://127.0.0.1:5173

# B. 本地服务版（额外支持界面内一键渲染 MP4）
npm.cmd run gui:build    # 先打包前端到 gui/dist
npm.cmd run server       # 起本地服务，打开 http://127.0.0.1:4000
```

本地服务版托管前端 + 静态素材（`public`，让预览用上真实音频/封面）+ 渲染产物（`out`），
并提供渲染 API。

## 界面

三栏布局：

- **编辑面板**：模板风格（下拉）、背景音乐、快闪段背景、主书（书名/作者/封面/背景/中英金句）、
  快闪书单（每行一本 `书名 | 作者 | 封面路径`）、开场视频、开场生成背景、开场角标、字幕开关。
- **实时预览**：`@remotion/player` 内嵌预览，改任意字段即时重渲，默认停在主书页。
- **导出配置**：把当前设置导出为 JSON，可直接作为批量数据的一项喂给 `render-batch`。

**批量队列**标签页（本地服务版）：粘贴批量数据（或"用当前编辑配置"），一键排队渲染，
表格实时显示每条状态 / 失败原因 / 产物链接，并支持暂停、恢复和失败条目单条重试。

支持 URL 预设，便于分享带初始内容的链接：
`?template=drama&title=东方快车谋杀案&author=阿加莎&zh=真相只有一个`，`?view=batch` 直接进批量页。

## 技术

- 纯前端，`esbuild` 打包（`scripts/build-gui.mjs`），无需后端服务。
- **复用渲染层**：预览用的 composition（`BookIntroFromConfig`）、`propsFromRaw`、
  `durationForProps`、模板注册表都直接 import 自 `src/`，界面所见即渲染所得。
- 表单 → 原始三件套配置 → `Player` 的 `inputProps`，与批量引擎的数据结构完全一致。

## 本地服务 API

`scripts/server.mjs`（Node 原生 http，无框架依赖）：

| 接口 | 说明 |
| --- | --- |
| `GET /api/health` | 探活（前端据此显示渲染按钮） |
| `POST /api/render` | 渲染当前配置（原始三件套 + template/audio）为 MP4，返回可播放 url |
| `GET /api/renders` | 列出已渲染产物 |
| `POST /api/batch` | 提交多条（批量数据数组），后台队列渲染，返回 jobId |
| `GET /api/batch/:id` | 查询批量队列进度（每条状态 / 质检 / 产物 url） |
| `POST /api/batch/:id/pause` | 当前条完成后暂停后续队列 |
| `POST /api/batch/:id/resume` | 恢复已暂停的批量队列 |
| `POST /api/batch/:id/retry` | 重试指定失败条目，body: `{ "index": 0 }` |
| `GET /api/batches` | 批量历史列表（内存态 + 磁盘归档，服务重启后仍可见） |
| `GET /api/assets` | 素材库清单 |
| `POST /api/assets/upload` | 上传本地素材，支持 `covers`、`backgrounds`、`introVideos`、`audio` |
| `POST /api/beats/detect` | 对本地 WAV 音频做瞬态检测，返回可写入 `flashCutFrames` 的切点帧 |
| `POST /api/covers/lookup` | 查询并缓存单本书封面，失败时返回 placeholder 降级状态 |
| 静态 | `gui/dist`（前端）、`public`（音频/封面）、`out`（产物） |

渲染复用 `scripts/batch/lib/render-core.mjs`（打包缓存 + `renderJob`），与批量引擎同一套核心。
渲染产物写到 `out/editor/`（不进仓库）。

## 与批量引擎的关系

```text
可视化编辑器  --导出配置 JSON-->  批量数据(.json)  -->  render-batch  -->  MP4
```

编辑器负责"单条可视化调参 + 预览"，批量引擎负责"多条自动化出片"，两者共享同一套配置结构。

## 后续

- 界面内读写批量数据文件、更多素材类型上传、关键帧视觉验收。
- 桌面封装（Electron / Tauri）。

已实现：可视化编辑 + 实时预览、导出配置、本地服务一键渲染、批量队列面板（进度/质检/产物/历史归档）、
主书本地封面上传、界面内自动卡点、界面内封面查询、批量队列暂停/恢复/单条重试/失败原因展示、
快闪书封、快闪背景、主书背景、开场视频、开场生成背景、开场角标和背景音乐替换。
