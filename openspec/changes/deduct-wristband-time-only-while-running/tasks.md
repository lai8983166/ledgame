## 1. 共享状态与契约

- [ ] 1.1 先为全部 GameEngine state 编写前端状态矩阵测试，验证只有 `RUNNING` 派生 `isConsumingWristbandTime=true`
- [ ] 1.2 实现 Touch、Debug Panel 和副屏共用的扣时状态派生与新 runtime/result DTO，并通过 1.1 的测试及 TypeScript 检查
- [ ] 1.3 增加 `TIME_BALANCE_EXHAUSTED`、准备不扣时和平台不可达的本地化文案，扫描并移除手环“首次刷卡后连续计时”的旧文案，验证默认语言与回退语言均可显示

## 2. 游戏准备界面

- [ ] 2.1 先补充 preparation 组件测试，覆盖单人/多人刷卡、余额不足、未刷齐禁用确认、取消后清理快照且不启动本地倒计时
- [ ] 2.2 修改玩家槽位和 `playerAccess` 展示，仅显示服务端余额快照并明确 `PREPARING/STARTING` 不扣时，通过 2.1 的测试
- [ ] 2.3 修改取消和重新进入流程，使其重新读取权威余额且不显示退款/暂停旧提示，并用交互测试验证状态不残留

## 3. 运行与结果界面

- [ ] 3.1 先补充 Touch、Debug Panel 和副屏测试，覆盖 `RUNNING→SETTLING→RUNNING` 的展示暂停/恢复及人工 End Game 停止展示
- [ ] 3.2 接入共享状态，在 `RUNNING` 中显示“本局已运行约 N 秒”或等价提示，在离开 `RUNNING` 时停止估算，并通过 3.1 的测试
- [ ] 3.3 为 `TIME_BALANCE_EXHAUSTED` 增加明确结果页和返回待机操作，验证不把该结果误显示为自然成功

## 4. 验证

- [ ] 4.1 运行前端单元测试、TypeScript 检查和生产构建，确认游戏模式、调试模式与副屏均成功构建
- [ ] 4.2 配合三端 `pnpm test:e2e` 验证配置停留不扣时、真实 RUNNING 扣时、多人和人工结束，并检查最终 UI 与平台余额一致
- [ ] 4.3 运行 `openspec validate deduct-wristband-time-only-while-running --strict` 并修复全部规格校验错误

