# LED Game Touch 流程

Touch IDLE 视频与 Debug RGB 预览并行时的性能问题、排查证据和修复原理见 [Touch IDLE 视频卡顿问题分析与修复](./touch-idle-video-stutter.md)。

## 窗口职责

- 主窗口提供“进入游戏”入口。入口只负责打开或聚焦 `LED Game Touch` 和 `LED Debug Panel`，并在后端处于无结果的干净 `STOPPED` 时初始化系统级 `IDLE`。
- `LED Game Touch` 面向玩家，负责 IDLE 待机画面、游戏选择、本局临时配置、启动/运行/结算提示和最终结果展示。
- `LED Debug Panel` 面向测试人员，负责查看 RGB 帧并模拟运行期间的玩法输入。
- Simple 编辑器中的“启动游戏”仍是快速验证入口，直接调用 `/game/start`，不打开 Touch、不创建 preparation，也不自动保存编辑文档。

关闭 Touch 窗口不会停止游戏。再次点击“进入游戏”会重建 Touch，并从后端读取当前权威状态。重复点击入口只会聚焦已有窗口，不会创建副本，也不会重置活动流程或已结束的结果页。

## 状态与 IPC

Touch 只通过 preload 暴露的最小 IPC API 访问后端：

- `game-flow:enter`
- `game:list`、`game:state`、`game:idle`、`game:stop`
- `game:preparation:create/select/update/confirm/cancel`
- `engine-state` 广播（后端 runtime action `12`）

Touch 挂载时先订阅 `engine-state`，再主动请求当前状态。mutation 响应和广播都作为完整权威状态替换本地快照；只有尚未提交的表单值保留在本地 draft 中。

生命周期映射为：

`IDLE -> PREPARING -> STARTING -> RUNNING -> SETTLING -> STOPPED`

结果页通过 `/engine/game/idle` 明确返回待机。Touch 不发送 retry、nextStage 或 complete 命令，关卡推进和结算时机由后端决定。

## 媒体边界

- Touch renderer 只播放自己的界面动画，不创建游戏音频播放器，也不消费 action `1/13`。
- 后端持有并播放 BGM、VOICE、SFX，同时生成和输出地板 RGB 帧。
- IDLE 彩虹对角线效果属于后端系统级 RGB 待机输出；Touch 使用 media root 下的 `dashboard/idle.mp4` 作为静音循环待机视觉，点击唤醒后立即移除，且不作为硬件帧或生命周期推进信号。
- 游戏封面由前端通过 `led-media://` 安全预览协议读取；renderer 不接触媒体根目录、后端 origin、文件系统或 Node API。
