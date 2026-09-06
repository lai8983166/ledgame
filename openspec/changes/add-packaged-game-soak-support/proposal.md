## Why

配合平台仓库 add-packaged-game-soak-acceptance，以打包应用进行 18 小时真实 UI 循环，需要稳定识别轮播选中项，以及隔离运行时关闭会员平台连接。

## What Changes

- 补轮播方向按钮和选中游戏 ID 选择器，不改变交互。
- 允许显式环境配置关闭自有后端房间连接，默认仍开启。
- 验证隔离配置和选择器；不修改后端玩法、结算规则、用户游戏库。

## Capabilities

### New Capabilities

- `packaged-game-soak-support`：打包游戏前端的隔离验收配置与可观察 UI。

### Modified Capabilities

无。

## Impact

electron/main.cjs、Touch 游戏轮播与前端聚焦测试。测试编排仍在平台仓库独立模块。
