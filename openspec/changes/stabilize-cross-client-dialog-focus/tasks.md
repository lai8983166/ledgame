## 1. 回归测试基线

- [x] 1.1 为统一 renderer 确认边界补充单元测试和裸 `window.confirm` 扫描测试，并验证旧调用点被发现
- [x] 1.2 为 main process 文件对话框 owner/finally 焦点恢复补充测试，并覆盖选择与取消分支
- [x] 1.3 为 preload 窗口 focus 重同步可编辑状态补充测试，并覆盖输入框与非输入元素
- [x] 1.4 为嵌套媒体选择弹层的 Tab/Escape 独占行为补充测试

## 2. Renderer 原生确认治理

- [x] 2.1 提取无框架依赖的 renderer 焦点恢复与确认工具，并通过单元测试
- [x] 2.2 将 Simple、Rank、触屏和数据库刷新页面统一接入确认工具，并通过页面契约测试

## 3. Electron 原生边界治理

- [x] 3.1 抽取主进程 BrowserWindow/WebContents 幂等焦点恢复函数，并复用现有 `window:restore-focus` IPC
- [x] 3.2 将 frame 导入导出、GIF 保存和 ELC408 文件保存对话框接入 sender owner 与 finally 恢复，并通过 main process 测试
- [x] 3.3 在 preload 的窗口 focus 生命周期重新同步 editable 状态，并通过 preload 测试

## 4. 嵌套弹层键盘治理

- [x] 4.1 让 `GameGlobalConfigDialog` 在媒体选择器打开时停止处理全部键盘导航，并通过焦点测试
- [x] 4.2 让 `GameInfoEditDialog` 在媒体选择器打开时停止处理全部键盘导航，并通过焦点测试

## 5. 综合验证

- [x] 5.1 运行游戏端相关测试、完整测试集和构建并修复所有回归
- [x] 5.2 运行 `openspec validate stabilize-cross-client-dialog-focus --strict` 并确认 Change 校验通过
