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
- `game:preparation:create-wristband`（只提交读卡器读取的数字 UID）
- `engine-state` 广播（后端 runtime action `12`）

Touch 挂载时先订阅 `engine-state`，再主动请求当前状态。mutation 响应和广播都作为完整权威状态替换本地快照；只有尚未提交的表单值保留在本地 draft 中。

生命周期映射为：

`IDLE -> PREPARING -> STARTING -> RUNNING -> SETTLING -> STOPPED`

结果页通过 `/engine/game/idle` 明确返回待机。Touch 不发送 retry、nextStage 或 complete 命令，关卡推进和结算时机由后端决定。

## 手环准入流程

键盘模拟读卡器只在数字 UID 后收到 Enter 时产生一次 `wristband-scanned`，IPC payload 只包含 `wristbandId`。Electron 和 Touch 都不构造会员、余额或绑定数据。

手环模式的完整链路为：

1. 顾客点击待机页，游戏后端先创建 `launchMethod=wristband`、尚未携带 UID 的 preparation，并进入游戏配置界面；待机页不显示刷卡提示，也不读取手环。
2. 配置界面提示刷手环。读到 UID 后，Electron 将它绑定到当前 preparation，游戏后端再以 `tokenList=[uid]` 调用会员管理端的激活接口。首次有效刷卡会将 READY 手环变为 ACTIVE，并从这一刻开始倒计时。
3. Touch 只消费游戏后端 runtime state 顶层的 `playerAccess`，显示会员、UID、状态和剩余时间。显示倒计时由服务端 `expiresAt` 推进，本地数值不参与放行；会员验证成功前“确认开始”保持禁用。
4. confirm 时游戏后端创建平台游玩记录，成功后才启动游戏；游戏结束后再回传结果和积分。

取消已激活的 preparation 只会取消本次游戏选择，不会暂停、退款或重置已购时段。平台不可达、超时、未登记、未绑定、已过期和正在其他设备使用都会阻止启动；界面刷新后端权威状态，不会使用本地缓存绕过。

## 开发验证

- `npm test`：覆盖待机点击进入配置、仅在配置内读卡、Enter/重复输入、UID-only IPC、当前 preparation 绑定、`playerAccess` 规范化、倒计时、错误映射和 confirm 恢复。
- `npm run build`：验证 Vue/Electron renderer 生产构建。renderer 不直连会员平台，也不读取 SQLite。
- 无硬件验证使用 UID `2283055618` 和隔离数据库/合同 HTTP stub；发布前再用实体读卡器验收一次 UID、Enter、窗口焦点和实际放行。

## 媒体边界

- Touch renderer 只播放自己的界面动画，不创建游戏音频播放器，也不消费 action `1/13`。
- 后端持有并播放 BGM、VOICE、SFX，同时生成和输出地板 RGB 帧。
- IDLE 彩虹对角线效果属于后端系统级 RGB 待机输出；Touch 使用 media root 下的 `dashboard/idle.mp4` 作为静音循环待机视觉，点击唤醒后立即移除，且不作为硬件帧或生命周期推进信号。
- 游戏封面由前端通过 `led-media://` 安全预览协议读取；renderer 不接触媒体根目录、后端 origin、文件系统或 Node API。
