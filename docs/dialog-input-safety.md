# 游戏端弹窗与输入安全

客户反馈 change 为 `client-feedback-2026-11-16`，规划与验收记录位于相邻 `ledGame-platform` 仓库。此次修复覆盖精灵删除后立即新增失去输入能力、模态弹窗背后快捷键误操作、组合输入 Escape 和异步窗口抢焦点。

## 确认交互

五个页面的八个业务确认入口使用 `useConfirmationDialog` 和 `ConfirmationDialog`，不再调用原生 `window.confirm`。包括精灵删除、普通编辑器删除关卡/帧/覆盖帧/效果影响、排行关卡删除、Touch 停止及数据刷新。取消按钮默认聚焦；Tab 留在确认内，按键不会传播给下面的弹窗或编辑器。Escape 只取消顶层确认。

确认属于发起它的组件作用域。离开页面会取消待决请求，重复点击不排队。每个确认组件携带原请求 ID，旧组件迟到回复不会解决新请求。确认通过后仍检查原文档、关卡、帧或 Touch 会话身份，防止旧操作应用到新目标。效果仍按一次确认提交一个原有撤销事务，取消保留草稿与历史。

## 输入与快捷键

精灵弹窗明确聚焦名称 input，不再用容器 focus 与 autofocus 竞争。操作完成后的 renderer 恢复只保留当前前台文档已有控件焦点，不调用原生恢复 IPC、不无条件 blur、不创建延迟回调。

普通编辑器在全局快捷键入口检查可见模态、忙碌状态和组合输入。弹窗存在时删除、移动、切帧、撤销重做及工具快捷键不能修改背后内容；输入控件仍接收正常键盘操作。

`isComposingEvent` 同时识别 `isComposing` 与兼容 `keyCode 229`。精灵、分类、媒体文件夹以及其他已接入的表单在组合输入时不按 Escape 关闭，App 菜单也不能先抢走模态表单焦点。普通 Escape、Tab 和保存语义保留。

## 原生文件选择与 Touch 窗口

文件选择/保存仍绑定请求来源窗口。异步完成只在 owner 仍可见、未最小化且仍为当前窗口时恢复 webContents，不主动显示、还原或激活已离开的 owner。

Touch 首次延迟显示捕获显式打开请求的窗口，只有请求窗口仍拥有焦点才激活；用户切走后仅非激活显示，后续加载完成不再次抢回。用户显式重复打开 Touch 仍按原流程激活。

## 回归与证据

- `pnpm test`：单测、既有契约、国际化检查。
- `pnpm test:dialog-input`：Chrome 中真实渲染组件，连续三次确认删除后新增并用键盘输入、组合 Escape、取消零写入、旧确认回复、效果/像素灯快捷键隔离、嵌套确认和效果撤销/过期文档。
- `pnpm test:dialog-input:electron`：在当前 Electron 版本的隔离 Windows 窗口运行同一套交互。
- `node scripts/check-dialog-input.cjs --electron --hold`：自动化通过后保留名称输入窗口，供真实 Windows 鼠标键盘验收；写入控制台所示的 `.build/dialog-input-*/finish` 文件结束并保存结果。

交互测试使用 `tests/ui/catalog-library-harness.html` 的临时内存 API，不请求真实后端、不读取现有授权、不写客户数据库。测试窗口与证据保留在 `.build/`。Chrome 默认使用已安装的 Chrome，可用 `DIALOG_TEST_BROWSER_CHANNEL` 指定其他已安装 Playwright channel；端口可用 `DIALOG_INPUT_PORT` 指定。

自动化中的中文文本提交与带组合标志的 Escape 只能验证应用事件处理，不能代表已覆盖所有真实输入法的候选窗口。Windows 原生键盘验收结果、实际发行包保护校验与剩余验证边界须记录在 change 的验收记录中。

## 打包

正常使用 `pnpm portable:dist`。如果当前 Windows 环境拒绝打包器将 `win-unpacked.tmp` 重命名为 `win-unpacked`，资源准备和构建完成后，可使用已安装的同版本 Electron 目录完成复制打包：

```text
pnpm exec electron-builder --config electron-builder.json --config.electronDist=node_modules/electron/dist --win dir zip
pnpm portable:verify-protection
pnpm portable:smoke-protection
```

此方式仍运行原有 beforePack、fuse 翻转及完整性资源写入，不需要关闭授权保护。目录版和 ZIP 均位于原 `release` 路径。
