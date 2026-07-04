# 矩阵编辑区 Canvas 渲染性能说明

## 背景

simple 游戏编辑器的矩阵主编辑区原来使用 DOM button grid 渲染。也就是说，矩阵里的每一个格子都是一个真实的 `<button>` 节点。

普通矩阵尺寸较小时，这种方式直观、容易写、事件处理也简单。但全景编辑模式会在真实 RGB 矩阵四周扩展虚拟区域，格子数量明显增加。此时每个格子都拥有自己的 DOM、样式、事件、hover 状态和 Vue 绑定，浏览器需要维护的对象数量会急剧上升。

这次改造后，矩阵主编辑区迁移为 Canvas 渲染层：

- 父组件仍然维护对象数据、选择状态、合并状态、基准点状态、保存和校验逻辑。
- Canvas 组件只负责把当前矩阵状态画出来。
- Canvas 组件通过鼠标坐标换算矩阵 `x,y`，再把点击和右键事件交回父组件。

所以这次优化不是改业务模型，而是把矩阵编辑区从“DOM 表单控件集合”改成“图形场景渲染”。

## 改造前：DOM Button Grid

改造前的渲染模型可以理解成：

```text
matrixCells
  -> v-for
  -> 每个 cell 一个 button
  -> 每个 button 绑定 class/style/title/click
```

全景模式下，如果真实矩阵是 `W x H`，四周各扩展 8 格后，渲染格子数量变成：

```text
(W + 16) * (H + 16)
```

例如真实矩阵为 `16 x 32`：

```text
普通模式：16 * 32 = 512 个格子
全景模式：(16 + 16) * (32 + 16) = 1536 个格子
```

如果每个格子都是一个 button，那么浏览器要维护 1536 个可交互 DOM 节点。每个节点还包含：

- 布局尺寸：width、height、gap。
- 绘制样式：background、border、outline、box-shadow。
- 状态 class：真实格、虚拟格、对象格、选中格、合并高亮、基准点高亮。
- 鼠标交互：hover、click、contextmenu。
- Vue patch：响应式状态变化后逐个比较和更新节点。

这就是卡顿的主要来源。

## DOM Grid 为什么容易卡

### 1. DOM 节点数量太多

DOM 节点不是普通 JavaScript 对象。它们同时参与浏览器的布局树、样式计算树、绘制树和事件系统。

当矩阵有上千个 button 时，浏览器每次更新都可能涉及：

- 重新计算每个节点的样式。
- 重新计算 grid 布局。
- 更新每个节点的绘制区域。
- 维护每个节点的命中区域。
- 处理每个节点的 hover 和 title 行为。

节点越多，这些成本越明显。

### 2. 缩放会触发布局重算

原来的缩放方式是改变每个格子的尺寸：

```text
cellSize = 18 * zoom
gapSize = 2 * zoom
```

在 DOM grid 中，这意味着每次滚轮缩放都要让整个 grid 重新布局。浏览器要重新计算所有 button 的位置和尺寸。

这类开销属于 layout/reflow，通常比单纯绘制更重。

### 3. hover 和 title 也会产生额外负担

每个 button 都有 hover 样式和 title。鼠标在矩阵上移动时，浏览器需要持续判断鼠标当前处在哪个 DOM 节点上。

全景模式下节点很多，鼠标移动时的命中测试、hover 切换和样式重绘都会变重。之前“title 出现也不流畅”的感觉，本质上也和大量 DOM 交互节点有关。

### 4. Vue 需要维护大量 vnode

即使使用 `v-memo`，Vue 仍然需要管理这批节点的生命周期和虚拟节点结构。

当对象列表、选择状态、基准点、高亮状态变化时，矩阵区域可能需要重新计算 `matrixCells`，Vue 需要把新的 cell 状态映射到已有 DOM 节点上。

`v-memo` 可以减少部分 patch，但不能消除上千个 DOM 节点本身的浏览器成本。

### 5. 每个格子的复杂样式会放大绘制成本

矩阵格子不是简单纯色块，还包含：

- border。
- dashed border。
- outline。
- box-shadow。
- 不同透明度。
- hover outline。
- anchor 高亮效果。

这些样式放在上千个 DOM 节点上，会造成大量小块绘制。浏览器需要分别处理每个节点的绘制和合成。

## 改造后：Canvas 渲染层

改造后的模型变成：

```text
matrixCells
  -> SimpleMatrixCanvas
  -> 一个 canvas 节点
  -> for 循环绘制所有格子
  -> 鼠标坐标换算 x,y
  -> emit 给父组件处理业务逻辑
```

也就是说，DOM 层不再有上千个 button。矩阵主编辑区在 DOM 中主要是：

```text
div.matrix-scroll
  -> div.matrix-canvas-wrapper
     -> canvas.matrix-canvas-surface
```

格子仍然存在，但它们不再是 DOM 节点，而是 Canvas 上的一批像素绘制结果。

## Canvas 为什么更流畅

### 1. DOM 节点数量从上千个降到一个

这是最大的变化。

DOM button grid：

```text
1536 个格子 = 1536 个 button DOM 节点
```

Canvas：

```text
1536 个格子 = 1 个 canvas DOM 节点 + 1536 次绘图指令
```

绘图指令仍然有成本，但它不会让浏览器维护 1536 个独立的布局节点、样式节点和事件目标。

浏览器对 Canvas 这种连续绘制场景更擅长，尤其适合网格、地图、像素编辑器、游戏画面这类 UI。

### 2. 不再让浏览器为每个格子做布局

Canvas 内部没有真实的 button，所以浏览器不需要计算每个格子的 DOM 布局。

格子位置由代码直接计算：

```js
const columnIndex = index % columnCount;
const rowIndex = Math.floor(index / columnCount);
const left = columnIndex * (cellSize + gapSize);
const top = rowIndex * (cellSize + gapSize);
```

这类计算只是普通 JavaScript 数学运算，比浏览器 layout 系统轻得多，也更可控。

### 3. 缩放变成一次重绘，而不是大量 DOM 重排

Canvas 版本里，缩放仍然改变 `cellSize` 和 `gapSize`，但影响的是 Canvas 的绘制参数。

滚轮缩放后，组件做的是：

```text
更新 cellSize/gapSize
  -> requestAnimationFrame
  -> 清空 canvas
  -> 按新尺寸重画格子
```

这避免了上千个 button 同时调整尺寸引发的 grid layout 重算。

### 4. 命中测试从浏览器 DOM 命中变成数学换算

DOM button grid 中，浏览器要判断鼠标在第几个 button 上。

Canvas 版本里，我们自己根据鼠标位置计算格子：

```js
const localX = event.clientX - canvasLeft;
const localY = event.clientY - canvasTop;
const columnIndex = Math.floor(localX / (cellSize + gapSize));
const rowIndex = Math.floor(localY / (cellSize + gapSize));
const cell = cells[rowIndex * columnCount + columnIndex];
```

这个计算是 O(1)，不会随着格子数量增加而线性变慢。

### 5. 高亮和 hover 变成 overlay 绘制

选中对象、合并选择、基准点高亮，不再通过 DOM class 触发大量节点样式变化。

Canvas 版本是在绘制每个格子时判断状态：

```text
如果是 selected-object-cell，画黄色 outline
如果是 merge-selected-cell，画绿色 outline
如果是 anchor-cell，画橙色 outline
如果是 hover cell，画 hover outline
```

这些都是 Canvas 绘图指令。状态变化时重画画布即可，不需要逐个 DOM 节点改 class。

### 6. requestAnimationFrame 合并绘制

Canvas 组件使用 `requestAnimationFrame` 调度绘制。

这意味着多个连续状态变化不会立刻同步重画多次，而是尽量合并到浏览器下一帧：

```text
状态变化
状态变化
状态变化
  -> 下一帧 drawCanvas()
```

这样更符合浏览器渲染节奏，也能减少滚轮缩放和鼠标移动时的抖动。

### 7. 高 DPI 适配集中处理

Canvas 组件会读取 `devicePixelRatio`，把实际画布像素设置为 CSS 尺寸的倍数：

```js
const ratio = window.devicePixelRatio || 1;
canvas.width = Math.round(width * ratio);
canvas.height = Math.round(height * ratio);
context.setTransform(ratio, 0, 0, ratio, 0, 0);
```

这样在高分屏上不会明显模糊，同时仍然只维护一个 DOM 节点。

## 这次改造中哪些逻辑没有变

Canvas 只是替换渲染层，以下业务逻辑仍然在父组件中：

- 当前帧对象列表。
- `selectedObjectId`。
- `selectionMode`。
- `mergeSelectionIds`。
- `anchorEditMode`。
- 点击空白格创建单格对象。
- 点击对象占用格不切换选择。
- 选择模式下点击对象加入合并高亮。
- 修改基准点。
- 右键菜单。
- 校验和保存时过滤虚拟区域对象。

也就是说，父组件仍然是编辑器状态的来源。Canvas 不保存业务状态，只接收父组件计算好的 `cells`，并把用户输入转回父组件。

这种分工很重要：

```text
父组件：负责数据和编辑规则
Canvas：负责显示和命中测试
```

这样性能优化不会把业务逻辑搅乱。

## 当前代码对应关系

### 父组件

文件：

```text
src/views/SimpleGameEditorView.vue
```

父组件继续计算：

```js
matrixCells
matrixRowCount
matrixColumnCount
matrixCellSizeValue
matrixGapSizeValue
```

然后传给 Canvas：

```vue
<SimpleMatrixCanvas
  :cells="matrixCells"
  :column-count="matrixColumnCount"
  :row-count="matrixRowCount"
  :cell-size="matrixCellSizeValue"
  :gap-size="matrixGapSizeValue"
  @cell-click="handleCellClick"
  @matrix-contextmenu="openContextMenu"
/>
```

点击格子的业务处理仍然是：

```js
function handleCellClick(x, y) {
  // 修改基准、选择合并、创建对象等逻辑
}
```

### Canvas 组件

文件：

```text
src/components/SimpleMatrixCanvas.vue
```

它主要做三件事：

1. 根据 `cells` 绘制矩阵。
2. 根据鼠标位置换算目标格子的 `x,y`。
3. 通过事件把点击和右键交回父组件。

绘制入口：

```js
function drawCanvas() {
  // 清空 canvas
  // 遍历 props.cells
  // drawCell(...)
}
```

命中测试入口：

```js
function getCellFromPointer(event) {
  // clientX/clientY -> canvas 内部坐标
  // canvas 坐标 -> row/column
  // row/column -> cell
}
```

事件输出：

```js
emit("cell-click", cell.x, cell.y);
emit("matrix-contextmenu", event);
```

## 为什么成熟编辑器通常也这样做

像绘画软件、像素编辑器、地图编辑器、游戏关卡编辑器，通常不会把每个像素或每个 tile 做成 DOM 节点。

它们一般采用类似结构：

```text
数据模型
  -> 渲染快照
  -> Canvas/WebGL/原生图形层
  -> 鼠标命中测试
  -> 回写数据模型
```

原因很简单：

- 图形密集区域适合用图形 API 批量绘制。
- 表单、按钮、列表适合用 DOM。
- 如果把图形密集区域也拆成大量 DOM 控件，浏览器会把很多时间花在布局和样式系统上。

我们的矩阵编辑区本质上更像像素编辑器或 tile map 编辑器，所以 Canvas 更符合它的形态。

## 性能提升的本质

这次流畅度提升的本质可以概括为一句话：

```text
把大量独立 DOM 节点的布局、样式、事件成本，转换成一个 Canvas 上的批量绘制成本。
```

更具体地说：

- 减少 DOM 节点数量。
- 减少浏览器 layout/reflow。
- 减少大量节点的 style recalculation。
- 减少 hover/title 的 DOM 命中压力。
- 减少 Vue 对大量 vnode 的 patch 成本。
- 用 `requestAnimationFrame` 合并绘制。
- 用数学命中测试替代每格 DOM 事件目标。

## 仍然可能存在的瓶颈

Canvas 不是万能的。它解决了 DOM 节点过多的问题，但后续如果矩阵继续变大，还可能遇到新的瓶颈。

### 1. 每帧仍然遍历所有 cells

当前 Canvas 绘制仍然是：

```text
for each cell in matrixCells:
  drawCell(cell)
```

如果未来矩阵扩展到非常大，例如上万格，每次重画全部 cells 仍然会有成本。

后续可以优化为只绘制可见区域：

```text
根据 scrollLeft/scrollTop 和 viewport 尺寸
  -> 计算可见 row/column 范围
  -> 只绘制可见格子
```

### 2. matrixCells 仍然由父组件完整计算

当前父组件仍然会生成完整的 `matrixCells` 数组。Canvas 减轻了 DOM 成本，但没有完全消除数据准备成本。

后续可以考虑让 Canvas 直接接收：

```text
matrixRange
expandedCellMap
selectedObjectId
mergeSelectionIds
colorOptions
```

然后在 Canvas 内部按可见区域即时生成要绘制的格子。

### 3. 超大对象或大量对象需要空间索引

当前命中对象主要依赖 `expandedCellMap`，这对当前规模足够直接。

如果未来对象数量和占用格数量都很大，可以考虑空间索引或分块缓存，例如：

```text
chunk key -> cells in chunk
```

这样移动、重绘和命中测试都可以进一步缩小范围。

### 4. 更复杂视觉效果可能需要分层 Canvas

现在真实格、虚拟格、对象、高亮都画在同一个 Canvas 上。

后续如果高亮变化非常频繁，可以拆成两层：

```text
底层 Canvas：真实格、虚拟格、对象颜色
上层 Canvas：hover、选中、高亮、基准点
```

这样 hover 变化时只重画 overlay 层，不需要重画整个矩阵。

## 结论

DOM button grid 适合小规模、表单式、控件式 UI。它的优点是简单，事件天然绑定在每个格子上。

但全景矩阵是图形密集编辑区，格子数量多、缩放频繁、hover 和高亮频繁。继续使用每格一个 DOM button，会让浏览器承担大量布局、样式、事件和 Vue patch 成本。

Canvas 版本把矩阵变成一个图形场景：

```text
数据仍然是对象
交互仍然按格子
保存结构不变
渲染从大量 DOM 节点变成单个 Canvas 批量绘制
```

所以流畅度提升明显，根本原因不是某个小技巧，而是渲染模型从“DOM 控件集合”切换成了“图形渲染层”。
