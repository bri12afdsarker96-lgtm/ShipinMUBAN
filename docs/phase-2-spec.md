# 二阶段开发说明

## 开发目标

把第一版固定样片升级为配置文件驱动的生成器，并接入真实书封查询。

## 配置文件

### `config/intro.example.json`

控制前几秒开场视频或默认生成背景。

字段：

- `mode`：`video` 或 `generated`。
- `videoPath`：本地视频路径。
- `trimStart` / `trimEnd`：裁剪秒数。
- `volume`：开场视频音量。
- `muted`：是否静音。
- `showSubtitles`：是否显示字幕轨道。

### `config/books.example.json`

控制中间快闪书单和最终主书。

字段：

- `flashCutFrames`：快闪切点帧。
- `flashBooks`：中间跳转书籍数组。
- `mainBook`：最终选定书籍。
- 每本书可含 `title`、`author`、`isbn`、`coverPath`、`coverQuery`。

### `config/subtitles.example.json`

控制独立字幕轨道。

字段：

- `tracks`：字幕轨道数组。
- 每条字幕包含 `startFrame`、`endFrame`、`zh`、`en`、`position`、`style`。

## 封面查询策略

1. 如果配置有 `coverPath`，优先使用本地文件。
2. 如果有 `isbn`，先按 ISBN 查。
3. 如果没有 ISBN，用书名和作者查。
4. Open Library 优先。
5. Google Books 作为补充。
6. 找不到封面时使用生成式占位封面，并在日志里标记。

脚本补充了代理回退：当 Windows 用户代理开启，或设置了 `COVER_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY`
时，`scripts/fetch-covers.mjs` 会用 curl 走代理下载。当前验收环境已确认代理链路可用，但真实封面仍未
闭环：Open Library 封面图返回 `503` 或超时，Google Books 返回 `429`，所以继续降级为 placeholder。

## 验收标准

- 修改配置即可更换快闪书单和主书。
- 至少能为常见英文书名下载真实封面。
- 无网络或找不到封面时仍能渲染。
- 字幕轨道从模板场景中分离。
- 前几秒可替换为本地视频素材。
- `npm.cmd run render` 可导出完整 MP4。
