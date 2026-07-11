# Simple 编辑器界面裁切问题说明

## 现象

在 Windows 高 DPI 和小屏幕环境下，Simple 编辑器右侧对象编辑区或底部内容被截断，但页面没有对应的滚动条。最大化窗口也不能完全解决问题。

同时还出现过两个相关现象：

- 从 Demo 切换到游戏列表时，导航栏短暂向上跳动。
- 打开 Simple 编辑器后，界面连续缩小几次。

## 排查过程

### 1. 排除 Electron 窗口本身超出屏幕

最初检查了 Electron 窗口尺寸、显示器 workArea 和 DPI。目标机器最终日志显示：

```text
scaleFactor=1.75
zoomFactor=1
workArea=1235x775
```

因此 175% DPI 和 Electron 的页面缩放都是正常的。窗口本身的最大化边框只多出约 16px，不是造成大面积右侧裁切的原因。

### 2. 通过布局诊断定位 DOM 尺寸

布局诊断记录到：

```text
fit baseWidth=1600
content clientWidth=1109
layout scrollWidth=1591
rightPanel right=1312
viewport right=1213
content overflow=hidden/hidden
```

这说明：

1. 编辑器设计宽度是 1600px。
2. 实际 content 被压缩成了 1109px。
3. 内部三列布局仍需要约 1591px。
4. 右侧对象面板已经超出 content 的边界。
5. content 使用 `overflow: hidden`，所以右侧内容被静默裁掉。
6. 外层 viewport 只看到被压缩后的 content，无法获得正确的横向滚动范围。

### 3. 找到最终遗漏

此前已经写了以下 CSS：

```css
.simple-editor-fit-content {
  flex: 0 0 auto;
}

.simple-editor-fit-content.simple-editor-workspace {
  overflow: visible;
}
```

但实际模板中的 section 只有：

```html
class="workspace simple-editor-workspace"
```

缺少 `simple-editor-fit-content` class。因此这两条 CSS 都没有匹配实际 DOM，修复自然不会生效。这也是之前检查不完整的地方：只验证了 CSS 是否进入打包文件，没有验证 class 是否挂载到真实元素。

## 最终修复

实际 content section 现在挂载完整 class：

```html
class="workspace simple-editor-workspace simple-editor-fit-content"
```

并保留以下布局规则：

- fit content 使用 `flex: 0 0 auto`，禁止 flex 将设计宽度压缩。
- content 使用正确的复合 class 覆盖 `overflow: hidden`。
- 外层 `simple-editor-fit-viewport` 统一负责横向和纵向滚动。
- shell 明确包含四周 padding，并把 padding 计入滚动尺寸。
- fit 缩放设置 65% 的可读下限，窗口过小时由滚动条承担剩余空间。
- Electron 主窗口初始尺寸和最小尺寸不超过显示器 workArea。

## 页面跳动和首次缩放

普通页面之前共享 `min-height: 100vh`，Demo 和游戏列表切换时内容高度变化，可能引起 document 高度和滚动位置重新计算。现在 app shell 固定为：

```css
height: 100vh;
grid-template-rows: auto minmax(0, 1fr);
overflow: hidden;
```

普通 workspace 在第二行内部滚动，因此导航栏位置不会随页面内容高度变化。

Simple 编辑器之前会在挂载、数据加载、字体加载、DOM 更新和 ResizeObserver 回调中多次测量 fit，并且第一次测量后就显示内容，所以用户能看到连续缩小。现在流程改为：

1. 加载数据。
2. 等待字体就绪。
3. 在隐藏状态下等待连续三帧布局稳定。
4. 完成最终 fit 测量。
5. 一次性显示编辑器。

这样保留了 fit 计算的准确性，但不会把中间测量过程展示给用户。

## 验证

已完成：

- 高 DPI 下窗口和 Simple 编辑器滚动验证。
- 普通矩阵、全景矩阵和 overlay 视觉验证。
- 帧复制、删除确认和 Level 排序验证。
- `pnpm run build`。
- `openspec validate improve-simple-editor-viewport-and-editing-workflow`。

## 结论

这个问题不是单一的 DPI 或滚动条 CSS 问题，而是多个布局层叠加：窗口尺寸、fit shell、flex shrink、content overflow，以及最终模板 class 缺失。真正有效的修复必须同时保证：实际 DOM 挂载正确 class、fit content 不被 flex 压缩、内部不静默裁切、外层拥有完整滚动范围。
