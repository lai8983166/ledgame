# LED Game Touch 流程

Touch IDLE 视频与 Debug RGB 预览并行时的性能问题、排查证据和修复原理见 [Touch IDLE 视频卡顿问题分析与修复](./touch-idle-video-stutter.md)。

## 窗口职责

- 主窗口提供“进入游戏”入口，打开或聚焦游戏模式的 `LED Game Touch`，并在后端处于无结果的干净 `STOPPED` 时初始化系统级 `IDLE`。
- `LED Game Touch` 面向玩家，负责 IDLE 待机画面、游戏选择、本局临时配置、启动/运行/结算提示和最终结果展示。
- `LED Debug Panel` 面向测试人员，负责查看 RGB 帧并模拟运行期间的玩法输入。
- 每个游戏编辑器的“启动游戏”进入主窗口内的调试页，使用模拟运行模式，可观察 RGB、模拟点击及暂停/重开；不会打开旧 Touch/DebugPanel 窗口。

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

1. 顾客点击待机页创建 preparation，先选择人数。点击 1P–6P 立即保存人数并进入独立刷卡页，无需再点击下一步；人数页和待机页不接受刷卡。
2. 刷卡页显示“待玩家刷卡”、已通过玩家姓名和人数进度。读到数字 UID＋回车后，提交当前 preparation，后端向会员管理端验证；重复卡、无余额等失败会留在此页，刷够所选人数后自动进入选游戏。
3. 左侧为实际一级菜单，右侧为该分类的游戏封面轮播。箭头/滑动切换，点击当前封面进入关卡页；无分类或未分类游戏同样可用。触屏/投币启动选择人数后跳过刷卡步骤。
4. 关卡页显示实际说明、全局时长（未设全局时长则显示所选关卡规则）和生命值，选择起始关卡后点击开始，完成原 5 秒倒计时再确认启动。Rank 保持从第一关开始。人数、刷卡、游戏、关卡每步重新计时 20 秒，超时取消准备返回待机；返回重选人数会取消旧准备并创建新准备。
5. confirm 时游戏后端创建平台游玩记录，成功后才启动游戏；游戏结束后再回传结果和积分。余额和状态由后端结果决定。

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
