## Context

主验收方案位于平台仓库 add-packaged-game-soak-acceptance。现有 Electron 支持 LED_USER_DATA_DIR，但强制开启房间连接；Touch 轮播仅卡片有 ID。

## Goals / Non-Goals

允许测试器以现有环境变量关闭房间联动；只读观察实际轮播选中 ID。不添加直接开局测试后门，不修改后端规则。

## Decisions

补 data-testid 与 data-selected-game-id，测试只能点击已有箭头。房间连接沿用 LED_ROOM_CONNECTION_ENABLED，未提供仍 true；不增加第二套设置存储。

## Risks / Trade-offs

源码选择器测试不等于打包 UI 验收，真实点击联调结果由主 Change 单列，未运行不能勾选。
