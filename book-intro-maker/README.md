# Book Intro Maker V1

第一版目标：根据三个样片拆出的规律，生成竖屏书籍开场模板。

核心参数在 `src/preset.ts`：

- `hookLines`：前 4 秒情绪钩子的中英字幕。
- `flashCutFrames`：书封快闪切点。当前默认来自逐帧分析，按 30fps 约 4 帧一拍。
- `bookCards`：快闪书单。
- `mainBook`：最终进入的主书氛围页。

运行：

```bash
npm.cmd run studio
npm.cmd run render
npm.cmd run covers
```

第一版先做模板生成和卡点验证，不做完整剪辑器。
