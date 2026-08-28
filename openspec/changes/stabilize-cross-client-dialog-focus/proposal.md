## Why

游戏端在关闭 `window.confirm` 或 Electron 原生文件对话框后，renderer/WebContents 可能没有重新取得系统焦点，表现为输入框、编辑器快捷键和刷手环输入突然失效。当前只有 Simple 游戏编辑器做了局部修复，其他入口仍会复现，需要把这一行为收敛为全局一致的桌面端能力。

## What Changes

- 提取可复用的 renderer 焦点恢复与确认框封装，替换游戏端仍直接调用的 `window.confirm`。
- 在 Electron 主进程集中封装原生打开/保存文件对话框，关闭后恢复所属 `BrowserWindow` 与 `webContents` 焦点。
- 在触屏窗口重新获得焦点时重新同步“当前是否聚焦可编辑控件”，避免刷手环键盘钩子误吞普通输入。
- 收紧嵌套媒体选择弹层的键盘焦点处理，确保同一时刻只有最上层弹层处理 Tab/Escape。
- 为 renderer、preload、main process 和关键页面增加焦点回归测试。
- 不修改游戏规则、硬件协议、后端 API 或编辑器数据格式。

## Capabilities

### New Capabilities

- `renderer-focus-continuity`: 规定游戏桌面端在原生确认框、文件对话框、嵌套弹层与刷卡输入模式切换前后的焦点连续性。

### Modified Capabilities

无。

## Impact

- 影响 Vue renderer 中使用确认框及嵌套弹层的页面和组件。
- 影响 `electron/main.cjs`、`electron/preload.cjs` 的焦点恢复与输入状态同步。
- 复用并替代 Simple 编辑器现有的局部焦点修复，不新增后端依赖。
