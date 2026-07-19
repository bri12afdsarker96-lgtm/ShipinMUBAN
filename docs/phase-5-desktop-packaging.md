# 阶段 5A：水星视频模板桌面封装

## 目标

把 `book-intro-maker` 从本地网页编辑器升级为 Windows 桌面软件第一版，软件名称固定为 **水星视频模板**。

第一版重点是三件事：

1. 启动软件后自动打开本地编辑器服务，不要求用户手动运行命令。
2. 提供 Windows 引导式安装包配置，可选择安装目录，并创建桌面与开始菜单快捷方式。
3. 将界面风格调整为水星系工具软件：深色左侧导航、右侧工作区、顶部批量操作、任务/日志区域。

## 实现范围

| 模块 | 结果 |
| --- | --- |
| 桌面壳 | 新增 `book-intro-maker/electron/main.cjs`，启动时自动加载本地服务并打开窗口 |
| 软件命名 | `package.json` 改为 `productName: 水星视频模板`，窗口标题与网页标题同步 |
| 安装包 | 新增 `electron-builder` 的 NSIS 配置，输出名为 `水星视频模板-Setup-${version}.exe` |
| UI 风格 | 编辑器外层改为水星下载参考风格：深蓝侧边栏、渐变标识、右侧工作区和顶部操作按钮 |
| 图标资产 | 新增 `electron/assets/logo.svg` 作为水星系视觉标识源文件 |
| 签名策略 | 第一版先关闭 `signAndEditExecutable`，产出未签名引导安装包；正式分发前再补证书签名 |
| 下载镜像 | 新增 `scripts/install-electron-cn.mjs` 与 `scripts/build-installer.mjs`，打包时自动使用 Electron / electron-builder 镜像 |

## 运行命令

```powershell
cd book-intro-maker
npm.cmd run electron:install
npm.cmd run gui:build
npm.cmd run desktop
```

## 打包命令

```powershell
cd book-intro-maker
npm.cmd run dist:win
```

生成目录：

```text
book-intro-maker/release/
```

## 当前验收边界

当前代码侧已完成桌面壳与安装包配置，`npm.cmd run dist:win` 已成功生成引导安装包。

安装包实物：

```text
book-intro-maker/release/水星视频模板-Setup-0.2.0.exe
```

- 大小：134,887,754 bytes
- SHA256：`8CC1FD4DF19053BB0FA2F369964D068F46FE7C5F0CFDACC8296AB60C1E8B6745`
- 目录版客户端：`book-intro-maker/release/win-unpacked/水星视频模板.exe`
- 目录版启动验收：客户端启动后 `http://127.0.0.1:43110/api/health` 返回 `{"ok":true}`

## v0.2.1 客户端结构迭代

本轮按“软件”而不是“网页表单”调整界面结构：

- 新增独立“素材库”：封面、背景图、开场视频、背景音乐分类展示，可批量上传、预览、复制路径。
- 主编辑页改为从素材库选择当前素材，上传只是补充入口。
- 新增“任务中心”：展示最近生成视频与批量任务记录。
- 新增“设置”：导出配置 JSON 移出主编辑页，收进高级配置。
- 左侧“素材替换”和“任务列表”不再是重复跳转，分别进入素材库和任务中心。

验证：

- `node --check scripts/server.mjs` / `scripts/test-regressions.mjs` 通过。
- `npx.cmd tsc --noEmit` 通过。
- `npm.cmd run gui:build` 通过。
- `npm.cmd test` 通过 18 项。
- 浏览器实测：编辑页可见区不再显示导出配置；素材库 / 任务中心 / 设置页面均可独立打开。

v0.2.1 安装包：

```text
book-intro-maker/release/水星视频模板-Setup-0.2.1.exe
```

- 大小：134,889,465 bytes
- SHA256：`28CC38E9EEB7AFE986E6A945623DF0B639CD884CBCA763FDF7AC954DABD7D010`
- 目录版客户端：`book-intro-maker/release/win-unpacked/水星视频模板.exe`
- 目录版启动验收：客户端启动后 `http://127.0.0.1:43110/api/health` 返回 `{"ok":true}`

## 下一步

- 为安装包补 `.ico` 正式图标与代码签名证书。
- 将用户上传素材和渲染输出迁移到用户数据目录，避免安装目录权限影响。
- 执行安装、启动、渲染、卸载四项完整验收。
