# Touch IDLE 视频卡顿问题分析与修复

## 问题现象

进入完整游戏流程后，`LED Game Touch` 在系统级 `IDLE` 状态播放 `dashboard/idle.mp4` 时出现明显卡顿，甚至停在某一帧。直接使用系统播放器播放同一个 MP4 则完全流畅。

该视频为 1920×1080、25 FPS、H.264 Main Profile，码率约 7.8 Mbps。这个规格对当前设备以及普通集成显卡都不构成实际压力，因此不能简单归因于视频分辨率或机器性能。

## 排查过程

### 1. 验证视频解码能力

Electron 的媒体诊断显示视频使用 `D3D11VideoDecoder`，即 H.264 硬件解码正常启用，GPU compositing 和 video decode 也处于可用状态。

将视频从 `led-media://` 自定义协议临时改为直接读取 `file://` 后，卡顿仍然存在，因此媒体协议和资源读取方式不是根因。

### 2. 隔离窗口

只保留 Touch 窗口时，视频在 10 秒内新增约 250 帧且没有新增丢帧，说明：

- MP4 文件本身有效；
- Electron 可以流畅解码和显示该视频；
- Touch 页面自身的状态更新和视频样式不是主要瓶颈。

打开 Debug Panel 后，视频立即出现暂停或大量丢帧。Debug Panel 关闭后，Touch 单独播放恢复正常。因此问题与 Debug Panel 的 RGB 预览渲染直接相关。

### 3. 窗口遮挡只是第一个表象

原来的完整流程先创建 Touch，再创建 Debug Panel。两个窗口都居中，而 Debug Panel 尺寸更大并且最后获得焦点，因此会完整遮挡 Touch。

Chromium 会把完全遮挡的 renderer 视为后台页面，Touch 的 `document.visibilityState` 变为 `hidden`，静音循环视频可能被暂停。这个问题解释了窗口切换后视频停住，但不能解释 Touch 保持可见时仍然大量丢帧。

### 4. 最终根因：Debug Panel 的逐像素 DOM 重绘

Debug Panel 原来使用 16×16、共 256 个 `<button>` 元素显示 LED 矩阵。后端系统 IDLE 每 50 ms 生成一帧 RGB 数据，即约 20 FPS。每收到一帧，前端都会：

1. 解码完整 RGB 数组；
2. 更新 Vue 响应式 `pixels`；
3. 修改 256 个按钮的背景色；
4. 重新计算这些元素的边框、圆角和内阴影；
5. 让 Chromium 对大量 DOM 元素执行样式、绘制与合成。

这不是单纯的“256 个元素很多”，而是 256 个带装饰效果的元素持续以 RGB 帧率更新。虽然 Touch 和 Debug 使用不同 renderer，它们仍共享 Electron 的 GPU 进程和窗口合成资源。Debug 的高频逐元素绘制会影响 Touch 视频帧的提交和呈现，最终表现为视频解码下溢、丢帧或停顿。

所以系统播放器流畅并不矛盾：系统播放器只需要解码和呈现视频，而当前 Electron 应用还同时执行高频 Debug DOM 绘制。

## 解决方案

### 1. 将 Debug LED 网格改为单个 Canvas

新增 `DebugLedCanvas.vue`，使用一个 `<canvas>` 绘制完整 16×16 LED 矩阵：

- 每帧只进行一次 Canvas 绘制；
- 不再修改 256 个 DOM 节点的样式；
- 使用 `requestAnimationFrame` 合并同一渲染周期内的重复更新；
- 保留点击坐标、悬停坐标和输入模式行为；
- Debug Panel 仍然显示最新 RGB 帧，不改变后端帧协议。

Canvas 更适合高频像素矩阵，因为矩阵是一张整体变化的位图，而不是 256 个需要独立布局和无障碍语义的界面控件。

### 2. 调整完整流程的窗口创建顺序

`enterGameFlow()` 改为：

1. 创建或聚焦 Debug Panel；
2. 创建或聚焦 Touch。

这样入口执行完成后 Touch 位于前台，不会刚开始播放就被 Debug Panel 完整覆盖。

正式部署时仍应将 Touch 全屏放在玩家触摸屏，将 Debug Panel 放在操作员显示器。窗口顺序只是单屏开发和窗口恢复时的保护，不代替最终多显示器布局。

### 3. 恢复可见时主动继续播放

Touch 监听以下事件：

- `document.visibilitychange`；
- `window.focus`。

当页面重新可见、当前仍处于 `IDLE` 且待机视频仍应显示时，主动调用 `video.play()`。这样即使 Chromium 曾因遮挡或后台策略暂停视频，切回 Touch 后也不会永久停在旧画面。

### 4. 禁用 Touch renderer 后台节流

Touch `BrowserWindow` 设置 `backgroundThrottling: false`，避免 Electron 在窗口短暂失焦时过度限制其渲染调度。

这只是防御措施。真正降低共享渲染压力的是 Debug Canvas 改造；仅关闭后台节流无法解决 Debug 逐像素 DOM 重绘造成的丢帧。

## 修复原理

原实现的成本近似为：

`RGB 帧率 × 256 个 DOM 元素 × 样式计算/绘制/合成`

Canvas 实现的成本近似为：

`RGB 帧率 × 1 个绘制表面`

Canvas 内部仍然需要绘制 256 个色块，但这些绘制命令在同一个 2D 上下文和位图表面完成，不触发 256 个独立 DOM 元素的布局、样式和合成管理。`requestAnimationFrame` 还会把短时间内到达的多帧合并为一次屏幕刷新，只呈现最新状态。

窗口可见性恢复逻辑解决“视频被浏览器策略暂停后不会自行继续”的状态问题；Canvas 改造解决“视频虽然处于播放状态但无法按时呈现帧”的性能问题。两者针对的是不同层次，缺一不可。

## 验证结果

修复后在重新生成的 unpacked package 中，同时保留以下三个窗口：

- 主窗口；
- `LED Game Touch`；
- `LED Debug Panel`，持续接收系统 IDLE RGB 帧。

Touch 视频 10 秒测试结果：

- 新增视频帧：249；
- 新增丢帧：0；
- `visibilityState`：`visible`；
- `paused`：`false`；
- 视频跨过循环结尾后继续正常播放。

同时完成以下验证：

- `pnpm test`：25/25 通过；
- `pnpm build`：通过；
- `openspec validate support-led-game-touch-flow --strict`：通过。

## 相关实现

- `electron/main.cjs`：Touch 窗口策略与完整流程窗口顺序；
- `src/views/LedGameTouchView.vue`：待机视频可见性恢复；
- `src/components/DebugLedCanvas.vue`：Canvas LED 预览与坐标交互；
- `src/views/DemoView.vue`：Debug Panel 接入 Canvas；
- `tests/gameFlow.test.mjs`：窗口策略和 Canvas 回归测试；
- `openspec/changes/support-led-game-touch-flow/`：对应设计、规格和任务记录。

## 后续注意事项

- 不应通过降低 Touch 视频分辨率掩盖 Debug 渲染问题；视频资源可以根据目标触摸屏分辨率优化，但那属于资源体积和画质策略。
- 如果未来 RGB 矩阵尺寸或输出帧率显著提高，应继续让 Debug 只绘制每个屏幕刷新周期内的最新帧，避免积压历史预览帧。
- Debug Canvas 只负责预览和输入映射，不应参与后端游戏 tick、媒体完成判断或生命周期推进。
- 正式多屏部署应明确 Touch 和 Debug 的目标显示器、全屏策略以及断开显示器后的恢复规则。
