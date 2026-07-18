# 架构骨架

## 总体结构

```text
ShipinMUBAN
  book-intro-maker
    src                 Remotion 模板代码
    config              示例配置
    scripts             素材查询、缓存、校验脚本
    public              Remotion 静态素材
  docs                  需求、规划、任务书
```

## 模块

### 模板渲染层

位置：`book-intro-maker/src`

职责：

- 根据配置生成视频。
- 负责开场视频、书封快闪、主书氛围页、字幕轨道的渲染。
- 不直接联网，不直接查询封面。

### 配置层

位置：`book-intro-maker/config`

职责：

- 定义开场视频、书单、主书、字幕轨道。
- 支持后续由 UI 或批量表格生成配置。

### 素材准备层

位置：`book-intro-maker/scripts`

职责：

- 查询真实书封。
- 下载和缓存图片。
- 生成可供 Remotion 使用的解析后配置。

### 产品层

阶段三新增。

职责：

- 可视化编辑。
- 批量任务导入。
- 渲染队列管理。
- 模板库和素材库管理。

## 数据流

```text
用户配置 / 表格
  -> 素材准备脚本
  -> 封面缓存与解析后配置
  -> Remotion 模板
  -> MP4 输出
```
