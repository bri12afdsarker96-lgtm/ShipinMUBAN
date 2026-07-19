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

## 运行命令

```powershell
cd book-intro-maker
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

当前代码侧已完成桌面壳与安装包配置，`npm.cmd run gui:build` 已通过。

本机实际生成安装包仍需要 Electron 运行时下载成功。当前环境中 `node_modules/electron/install.js` 多次下载超时，未得到 `node_modules/electron/dist/electron.exe`，因此本轮不能诚实声称安装包已经实际产出。网络恢复或切换 Electron 镜像后，重新执行：

```powershell
cd book-intro-maker
$env:npm_config_cache='D:\项目开发\MUBAN\.npm-cache'
node node_modules\electron\install.js
npm.cmd run dist:win
```

## 下一步

- 为安装包补 `.ico` 正式图标。
- 将用户上传素材和渲染输出迁移到用户数据目录，避免安装目录权限影响。
- 在真实 Windows 安装包产出后，执行安装、启动、渲染、卸载四项验收。
