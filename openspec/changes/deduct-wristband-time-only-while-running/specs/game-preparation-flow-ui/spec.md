## ADDED Requirements

### Requirement: 准备阶段不得表现为正在扣除手环时间
Touch SHALL 将手环刷卡解释为当前 preparation 的玩家资格校验，且在 `PREPARING` 和 `STARTING` 阶段不得显示余额正在持续消耗。

#### Scenario: 配置阶段刷入手环
- **WHEN** 会员平台接受手环且后端返回 `playerAccess`
- **THEN** Touch 显示会员、手环 UID 和可用游戏时长
- **AND** Touch 不启动本地余额倒计时或显示连续到期时间

#### Scenario: 取消已经刷卡的 preparation
- **WHEN** 玩家刷卡后取消游戏配置并回到待机
- **THEN** Touch 不显示扣时、退款或重置提示
- **AND** 再次进入配置时由服务端重新读取未消耗的权威余额

#### Scenario: 启动阶段等待
- **WHEN** preparation 已确认但 `engineState` 仍为 `STARTING`
- **THEN** Touch 显示游戏正在启动
- **AND** Touch 明确该阶段尚未消耗游戏时长

### Requirement: 多人准备展示每位玩家的余额资格
Touch SHALL 为当前配置要求的每位玩家展示独立刷卡结果，并只在全部玩家都具有正余额时允许确认。

#### Scenario: 多人尚未刷齐
- **WHEN** `userCount` 为 2 但只有一只手环通过校验
- **THEN** 确认开始保持禁用且已通过玩家的余额不被消耗

#### Scenario: 玩家余额不足
- **WHEN** 任一刷入手环被服务端以余额不足拒绝
- **THEN** Touch 显示该玩家的明确拒绝原因并允许重新刷入其他手环

