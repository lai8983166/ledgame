## ADDED Requirements

### Requirement: Touch 按引擎状态展示扣时语义
Touch SHALL 仅在权威 `engineState=RUNNING` 时表现为正在消耗手环游戏时长，并在其他状态停止该表现。

#### Scenario: 进入 RUNNING
- **WHEN** Touch 收到 `engineState=RUNNING`
- **THEN** 运行界面显示本局正在消耗游戏时长
- **AND** 前端展示值只能作为运行态估算，不得直接修改权威余额

#### Scenario: 进入 SETTLING
- **WHEN** Touch 从 `RUNNING` 收到 `engineState=SETTLING`
- **THEN** Touch 立即停止运行态估算并显示结算中

#### Scenario: 再次进入 RUNNING
- **WHEN** 多关卡游戏从 `SETTLING` 进入下一关的 `RUNNING`
- **THEN** Touch 恢复正在消耗游戏时长的展示

#### Scenario: 余额耗尽
- **WHEN** 后端以 `TIME_BALANCE_EXHAUSTED` 结束游戏
- **THEN** Touch 显示手环游戏时长已用完的可读结果并允许返回待机

### Requirement: 调试模式和游戏模式共用扣时状态来源
Debug Panel、Touch 主屏和副屏 SHALL 根据同一个后端 runtime state 判断是否正在扣时，不得各自实现不同的生命周期规则。

#### Scenario: Debug Panel 人工结束游戏
- **WHEN** 调试人员在 `RUNNING` 期间点击 End Game
- **THEN** 所有窗口停止显示正在扣时并进入后端返回的结算或停止状态

#### Scenario: 调试交互模拟得分
- **WHEN** Debug Panel 在 `RUNNING` 期间触发玩法互动
- **THEN** 该互动使用与真实地砖输入相同的游戏生命周期，且不改变扣时规则

