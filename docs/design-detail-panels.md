# 明细面板（失败文件 / 未纳入索引）设计

## 1. 面板形态

两个面板**共用**同一套结构：

```
<section class="fs-card">
  <div class="fs-panel-head">            ← 标题行：只有「标题 + 计数」两个子元素
    <h3 class="fs-panel-title">…</h3>
    <span class="fs-panel-count">N</span>
  </div>
  <ul class="fs-failed-list">            ← grid **两轨**，高度固定 100px，框内滚动
    <li class="fs-failed-item">          ← grid-template-columns: subgrid
      <span class="fs-failed-path">…</span> ← 第 1 轨 minmax(0, 1.1fr)，文件名（等宽字体）
      <span class="fs-muted fs-failed-reason">…</span> ← 第 2 轨 minmax(0, 1fr)，原因，三行限高
    </li>
  </ul>
</section>
```

**两列轨道由 `.fs-failed-list` 定义、行用 `subgrid` 继承** —— 这是「列对齐」的关键：
若把列定义写在行上（`li` 各自定义 grid），每行宽度各自计算，列起点就会漂移。
两个面板的列表轨道相同 ⇒ **跨面板也逐列对齐**。

## 2. 每列的含义

| 列 | 内容 | 例 |
|---|---|---|
| 1 | **文件名**（完整路径，等宽字体，可换行）| `/home/<user>/test2/cuda/docs/深度拷问清单.md` |
| 2 | **原因**（一句话说清「为什么没进索引 / 为什么失败」）| `The filename is not UTF-8, so it cannot be indexed…` |

两列就够：真信息只有「哪个文件」和「为什么」。分类标签函数
（`failureKindLabel` / `notIndexedKindLabel`）与 locales 键仍在 `detailText.ts` 里保留，
供测试与将来复用；界面不渲染分类徽标——它只是把原因列换个措辞再说一遍，而且按内容定宽
正是列漂移的根源。

原因文案由**前端按当前语言出词**：后端只给结构化事实，不塞中文句子。

## 3. 设计决定与依据

| 决定 | 依据 |
|---|---|
| 固定高度 100px + 框内滚动 | 条数不影响整框高度，卡片高度稳定（标题行 `h3` 的默认外边距归零） |
| 两轨 grid + `subgrid`，不用 flex | 列起点逐行漂移（路径列 115/115/172；跨面板 25px 差）在 flex 下无法根除 |
| 只留「文件名 │ 原因」两列 | 内容对齐是首要判据；徽标列按内容定宽，会破坏对齐 |
| 原因列**左对齐** | 与文件名列形成两条竖直基线；不要改回 `text-align: right`（右对齐时左边界参差） |
| 两面板共用列轨道 | 跨面板逐列对齐 |
| 面板自身带标题 + 计数 | 否则两个框长得一样，用户分不清打开的是哪个 |

## 4. 验收判据

- **逐行一致**：同一列的起点在所有行上必须相等（对 `.fs-failed-list` 取实际布局矩阵相比），
  这是改动的主判据。
- **跨面板一致**：两个面板共用同一套轨道，同列起点跨面板也要相等。
- **高度固定**：用真实服务数据量卡片高、标题行子元素与行列数，确认框高不随条数变。
- **滚动条可见**：`overflow-y: scroll`（不是 `auto`），凹槽常显；量凹槽像素与卡片底色的
  亮度差，不能只看 `offsetWidth - clientWidth`（overlay 滚动条留了位置却不一定画出来）。
- **文案随语言**：切英文后原因文案不含中文。

## 5. 两处容易量错的坑

1. **「占位」不等于「画出来」**。`offsetWidth - clientWidth = 10px` 只能说明留了槽；
   overlay 滚动条留了位置却不一定绘制。测量要落到**像素**（在渲染快照的 PNG 里采样那一
   列的颜色）。
2. **同一选择器在产物 CSS 里可能出现在多个块中**。只取**第一个** `.fs-failed-list{…}`
   会漏掉真正带 `height:100px` 的那块，误报「固定高度 = False」。判据要用
   `re.findall(sel + r'\{[^}]*\}')` 打**全部**匹配块。
