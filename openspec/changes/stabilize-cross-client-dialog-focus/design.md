## Context

参见 `proposal.md` 的 Why。`SimpleGameEditorView` 已有局部 `restoreEditorFocus`，但另外三个页面仍直接使用 `window.confirm`，四组 IPC 文件对话框也没有统一的 finally 恢复。触屏 preload 只在 `focusin/focusout` 上报编辑状态，原生对话框造成的窗口级焦点切换会让主进程保留错误状态。两个编辑器配置弹层与其媒体选择器还会同时监听全局 keydown。

## Goals / Non-Goals

**Goals:**

- 为所有 renderer 原生确认提供同一恢复逻辑。
- 让主进程拥有唯一的 BrowserWindow 焦点恢复实现，并覆盖所有打开/保存文件 IPC。
- 让 preload 在窗口重新激活时修正可编辑状态。
- 让嵌套弹层按视觉层级独占键盘事件。
- 用自动化测试阻止重新出现裸原生边界。

**Non-Goals:**

- 不替换现有 Electron 原生文件对话框。
- 不改变刷手环数据格式、游戏流程或编辑器保存协议。
- 不修改平台仓库代码；平台端由同名联动 Change 独立实施。

## Decisions

### 1. renderer 使用无框架依赖的统一焦点工具

新增轻量工具封装 `window.confirm`。恢复动作依次请求 preload IPC 聚焦窗口、调用 renderer `window.focus()`、blur 遗留活动元素，并在异步边界后重复一次。Simple 编辑器改为复用该工具，Rank 编辑器、触屏页和数据库刷新页全部通过该入口确认。

备选方案是只给新增三处复制现有函数；重复实现会随页面增长再次漂移，因此不采用。

### 2. main process 用 sender 定位窗口并在 finally 恢复

文件对话框包装器通过 `BrowserWindow.fromWebContents(event.sender)` 找到发起窗口，把它作为 dialog owner，并在 `finally` 中调用统一窗口恢复函数。恢复函数覆盖 `BrowserWindow.focus()`、`webContents.focus()` 与短延迟重试，以适应 Windows 原生 dialog 关闭后的消息循环时序。

### 3. preload 在窗口 focus 时重新计算编辑状态

除现有 `focusin/focusout` 外，窗口 `focus` 事件在下一任务中读取 `document.activeElement` 并重新上报。这样主进程的 wristband gate 不依赖原生对话框前的一次陈旧 `focusout`。

### 4. 嵌套弹层由子层独占全局 keydown

父配置弹层在媒体选择器打开时对全部键盘导航直接返回，不再只忽略 Escape。媒体选择器自己的 focus trap 负责 Tab/Escape；关闭后父层恢复处理。

## Risks / Trade-offs

- [Windows 在 dialog promise 结束时仍未允许聚焦] → 保留 immediate 与短延迟的幂等重试。
- [blur activeElement 影响希望保留光标的页面] → 仅在原生确认边界执行，业务页面在状态更新后由用户或组件重新选择目标。
- [窗口 focus 与 focusin 连续上报] → IPC 值是幂等布尔状态，不产生业务副作用。

## Migration Plan

无数据迁移。先引入工具与测试，再逐一替换调用点；主进程包装器保持现有 IPC 返回结构，因此可独立回退。
