# Electron 原生对话框关闭后输入框失去焦点

## 问题概述

在 Electron + Vue 等前端应用中，使用 `window.confirm()`、`window.alert()` 或其他原生对话框后，可能出现以下现象：

- 输入框可以正常显示，但点击后无法获得光标；
- 输入框无法输入，甚至所有输入框都受到影响；
- 下拉框、按钮或其他交互控件也可能表现得像没有命中；
- 最小化再恢复窗口后，交互暂时恢复正常；
- 问题通常发生在复制覆盖、删除确认等破坏性操作之后。

这类问题容易被误判为 Vue 的响应式更新、`v-model`、输入框 `key` 或 CSS 覆盖问题。若问题只在原生确认框关闭后出现，优先检查 Electron renderer 的窗口焦点是否恢复。

## 根本原因

`window.confirm()` 的执行过程是同步阻塞的：

1. renderer 线程调用 `window.confirm()`；
2. Electron 显示原生确认对话框；
3. 当前窗口或 WebContents 暂时失去焦点；
4. 用户点击“确定”或“取消”，对话框关闭；
5. JavaScript 继续执行，但 renderer 不一定已经重新获得可交互焦点。

因此，DOM 中的输入框仍然存在，`disabled`、`pointer-events` 和 `v-model` 也可能完全正常，但系统焦点没有回到 Electron 窗口，后续点击就不会产生预期的聚焦行为。

最小化再恢复窗口能够暂时解决，是因为窗口恢复过程会触发操作系统和 Electron 的重新激活流程，间接重建窗口焦点。这不是业务代码已经正确修复，而是窗口生命周期动作碰巧掩盖了问题。

## 为什么不是单个输入框的问题

如果只有某一个输入框失效，才更应该检查：

- 输入框是否被 `disabled` 或 `readonly`；
- 父节点是否设置了 `pointer-events: none`；
- 元素是否被遮挡或发生了错误的 transform；
- Vue 是否因为 `v-if` 或错误的 `:key` 复用了不合适的 DOM 节点。

但如果复制操作之后所有输入框都无法聚焦，并且最小化/恢复窗口后全部恢复，故障范围已经超出某个组件，通常应检查窗口焦点和原生对话框生命周期。

## 推荐修复方式

将破坏性操作的确认逻辑集中到一个辅助函数中，在原生对话框返回后统一恢复 renderer 焦点：

```js
function restoreRendererFocus() {
  window.focus?.();

  const activeElement = window.document?.activeElement;
  if (activeElement && typeof activeElement.blur === "function") {
    activeElement.blur();
  }
}

function confirmDestructiveAction(message) {
  const confirmed = window.confirm(message);
  restoreRendererFocus();
  return confirmed;
}
```

这里有两个动作：

- `window.focus?.()`：请求 Electron 窗口重新获得焦点；
- `activeElement.blur()`：清理原生对话框关闭后可能残留的失效焦点，避免下一次交互继续被旧焦点状态影响。

所有删除、覆盖、批量替换等需要确认的操作都应调用这个统一函数，而不要在各个按钮处理函数中分别直接调用 `window.confirm()`。

## 处理 Vue 更新后的焦点

如果确认后还会切换当前帧、替换 DOM 或改变 `:key`，建议在 Vue 更新完成后再做一次焦点清理：

```js
if (mode === "next") {
  selectFrame(targetIndex);
  nextTick(restoreRendererFocus);
}
```

原因是 `selectFrame()` 可能触发：

- 当前帧输入框重新渲染；
- `v-if` 分支切换；
- `:key` 变化导致输入框 DOM 被替换；
- 旧焦点节点被移除。

确认框返回时立即恢复一次焦点，Vue 下一轮 DOM 更新后再恢复一次，可以覆盖这两种不同的时序。

## 不应只做的修复

### 只给输入框增加 `:key`

稳定的 `:key` 可以避免输入框在帧切换时被错误复用，但它只能解决 DOM 复用问题，不能解决 Electron 原生对话框关闭后的窗口焦点问题。

### 只修改 CSS

调整 `z-index`、`pointer-events` 或容器尺寸对这个问题通常无效。错误发生在系统焦点层，不一定存在 CSS 命中问题。

### 让用户最小化再恢复窗口

这只是规避方式，不能作为产品行为。用户不应该通过窗口操作来恢复编辑器输入能力。

### 每个输入框分别添加特殊处理

这样会造成维护成本和行为不一致。问题属于 renderer/window 级别，应在确认对话框的公共边界统一处理。

## 适用范围

这套处理适用于：

- Electron renderer 中的 `window.confirm()`；
- 删除关卡、删除帧、删除对象等确认操作；
- 覆盖帧、批量复制等可能破坏已有数据的确认操作；
- 确认后会切换 Vue 状态或重新渲染表单的操作。

如果项目改用 Electron 主进程的自定义对话框，仍应在对话框关闭后检查 renderer 是否重新获得焦点，必要时通过 IPC 通知 renderer 执行同样的焦点恢复逻辑。

## 回归验证清单

每次修改确认流程或 Electron 窗口行为后，至少验证：

1. 打开包含多个输入框的编辑器；
2. 直接点击普通输入框，确认可以输入；
3. 执行会覆盖已有内容的复制操作；
4. 在确认框中点击“确定”；
5. 继续点击并输入 `repeatTimes`；
6. 继续测试游戏名称、关卡名称、颜色配置等其他输入框；
7. 在确认框中点击“取消”，重复上述输入测试；
8. 测试删除关卡、删除帧、删除对象等其他确认操作；
9. 检查输入框没有被错误禁用，且不需要最小化/恢复窗口；
10. 执行项目已有的单元测试和构建命令。

针对本项目，回归测试应同时覆盖：

- 复制到下一帧时没有覆盖目标帧；
- 复制到下一帧时覆盖已有目标帧并确认；
- 覆盖确认框中选择取消；
- 确认框关闭后输入框重新成为 `document.activeElement`。

## 本项目中的落点

当前实现位于 `src/views/SimpleGameEditorView.vue`：

- `confirmDestructiveAction()` 统一封装确认框；
- `restoreEditorFocus()` 恢复 Electron renderer 焦点并清理旧焦点；
- 覆盖复制后通过 `nextTick()` 等待 Vue 完成帧切换，再执行焦点恢复。

对应的回归契约位于 `tests/simpleEditorFrameActionsContract.test.mjs`，用于防止后续重构时移除这段焦点恢复逻辑。

## 结论

“所有输入框突然不能输入，但最小化再恢复后正常”是一个典型的 Electron renderer 焦点恢复问题。排查时应优先根据触发时机区分 DOM/CSS 问题和窗口焦点问题；对于原生对话框，统一在关闭后恢复窗口焦点，并在 Vue 更新完成后再次清理焦点，通常可以稳定解决这类故障。
