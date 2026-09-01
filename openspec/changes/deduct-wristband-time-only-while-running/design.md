## Context

Touch、Debug Panel 和副屏均通过 runtime state 观察 GameEngine，但现有手环配置 UI 仍包含“刷卡后连续计时、取消也不暂停”的旧语义。权威余额位于会员平台，运行区间累计位于游戏后端，前端只负责状态展示与错误反馈。

## Goals / Non-Goals

**Goals:**

- 所有 renderer 使用同一个 `engineState` 判断是否表现为正在扣时。
- 配置阶段准确展示每位玩家的准入与余额，不创建前端计费事实。
- 对余额耗尽、人工结束和服务不可达提供可读状态。

**Non-Goals:**

- 不在 renderer 中持久化或扣减会员余额。
- 不重做 Touch 页面结构、玩法画面、副屏积分布局和排队流程。
- 不承诺前端估算秒数等于平台已提交余额；最终余额必须重新查询平台。

## Decisions

### 1. `engineState` 是唯一展示开关

建立共享的状态派生：只有 `RUNNING` 返回 `isConsumingWristbandTime=true`；`PREPARING`、`STARTING`、`SETTLING`、`STOPPED` 和 `IDLE` 均为 false。Touch、Debug Panel 和副屏复用该派生结果或后端等价字段。

没有根据页面路由或“已经点击开始”判断，因为这些前端事件可能早于真实硬件和玩法完成启动。

### 2. 准备页只展示服务端快照

`playerAccess` 展示 UID、会员和 `remainingSeconds`，不再展示首次激活 `expiresAt`，也不启动余额倒计时。多人准备按玩家槽位展示独立校验结果，全部刷齐且均可用后才允许 confirm。

取消时移除“计时不会暂停/不会退款”文案；再次准备重新调用后端读取权威余额，避免沿用旧快照。

### 3. RUNNING 中的秒数只能标记为估算

若 UI 需要逐秒反馈，则使用从最近一次 runtime state 开始的本地单调计时，只作为“本局已运行约 N 秒”展示；状态离开 `RUNNING` 立即暂停。页面不从 `remainingSeconds` 直接写回平台，也不将估算值标为已扣余额。

### 4. 终止原因显式映射

增加 `TIME_BALANCE_EXHAUSTED` 的本地化展示。`MEMBER_PLATFORM_UNAVAILABLE` 继续优先提示检查网络、会员管理端服务地址或防火墙；人工结束和启动失败保持现有结果含义。

## Risks / Trade-offs

- [广播延迟使前端估算与后端相差少量时间] → 仅展示约数，最终余额始终来自平台查询。
- [多个窗口各自重复实现状态规则] → 抽取共享派生函数并以状态矩阵单测覆盖全部 engine state。
- [旧翻译仍包含连续有效期文案] → 扫描手环准备相关 i18n key，删除旧语义并为新增错误提供默认语言回退。

## Migration Plan

1. 先兼容读取后端不带新字段的 runtime state，默认不展示运行用量。
2. 与新游戏后端一起发布后启用 `RUNNING` 状态提示和余额耗尽原因。
3. 用游戏模式与调试模式分别验证：配置取消不扣时、进入运行开始提示、结算停止提示。
4. 回滚前端不会影响数据库，但应与对应后端版本成套回滚以避免文案与真实计费规则不一致。

