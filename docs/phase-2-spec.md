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

## 验收标准

- 修改配置即可更换快闪书单和主书。
- 至少能为常见英文书名下载真实封面。
- 无网络或找不到封面时仍能渲染。
- 字幕轨道从模板场景中分离。
- 前几秒可替换为本地视频素材。
- `npm.cmd run render` 可导出完整 MP4。
