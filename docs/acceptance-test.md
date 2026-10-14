# 集成验收指南

> 验收对象：宿主桌面应用 BiBit + `bibit-filesearch-plugin` + 后端 `bibit-filesearch` 服务。

## 一、验收目标

| # | 目标 | 对应链路 |
|---|---|---|
| 1 | BiBit 启动，界面正常 | 宿主进程 |
| 2 | 设置 →「功能」分组出现「文件检索」，能配置 / 保存 / 索引 | 插件页 → `:18700` |
| 3 | 检索验证区能搜出结果，名次与后端一致 | 插件页 → `POST /api/search` |

## 二、环境清单（验收前应全部就绪）

| 组件 | 端口 | 状态检查 |
|---|---|---|
| bibit-filesearch（deb，per-user 服务）| 18700 | `curl http://127.0.0.1:18700/health` → `{"code":0,...,"status":"ok"}` |
| embed 端点（OpenAI 兼容）| 18790 | `curl http://127.0.0.1:18700/health/deep` → `"embed":"ok"`（响应里的 `embedUrl` 即该端点）|
| 插件包 | — | `/usr/lib/bibit/plugins/filesearch-*.bibit-plugin.tgz`（已装）|
| 宿主受信清单 | — | 含本插件的 keyId（默认 `filesearch-development`）|
| 宿主二进制 | — | `/usr/bin/bibit-gui`（桌面入口 `BiBit.desktop`）|

版本确认：

```bash
dpkg-query -W -f='${Package} ${Version}\n' bibit-filesearch bibit-filesearch-plugin
```

## 三、启动 BiBit

**在桌面终端里直接跑**（不要 sudo、不要 runuser、不要包 env——桌面会话已经带齐了
`DISPLAY` / `XDG_RUNTIME_DIR` / `DBUS_SESSION_BUS_ADDRESS`）：

```bash
bibit-gui &
```

**预期**：桌面出现 BiBit 主窗口。

插件是**打包产物**：改插件源码后必须重打 deb 并**重启 GUI** 才会生效——同版本号时由
`sync_system_plugins` 从系统 tgz 强制同步到
`~/.local/share/BiBit/data/plugins/installed/filesearch/<ver>/dist/`。

## 四、测试 1：插件配置页

1. 设置 → 功能 → 点击「文件检索」
2. 预期看到四块：
   - **概览条**：状态 + 已索引文件 + 待向量化 + 未纳入索引 + 失败文件（5 格）
   - **索引配置**：知识库路径 / 深度 / 检索返回条数（Top-K）/ 格式勾选 / 排除规则 / 自动索引
   - **明细面板**：失败文件 / 未纳入索引（有内容时可展开，两列：文件名 │ 原因）
   - **检索验证**：输入框 + 检索按钮
3. 操作验证：
   - 改格式勾选或排除规则 → 点「保存并索引」
   - 预期：状态先变「扫描中」，完成后变「已完成」，计数更新
   - 检索验证输入关键词 → 点检索 → 列出结果

> ⚠️ 两个容易误判的点：
> - **Top-K 默认是 5**；它只管「返回几条上限」，**不影响排序**。
> - 结果卡片右上角显示**名次 `#N`**，不是「匹配度百分比」——百分比是 min-max 归一化
>   产物（头名恒 100%），会被读成匹配度。

配置修改会真实写入 `~/.config/bibit-filesearch/config.yaml` 并触发重扫描，不是演示。

逐项判据（排除规则生效性、Top-K、名次显示、恢复默认、语言、刷新反馈、增量索引状态）
见 [`acceptance.md`](acceptance.md)。

## 五、测试 2：检索验证（核心验收）

1. 在检索验证区输入一个知识库里确实存在的关键词。
2. **预期**：返回结果卡片列表，每张卡片含文件名、名次 `#N`、类型标签、大小、
   更新日期、完整路径；命中确为相关文档。
3. 命令行侧旁证（可选）：

```bash
curl -sS -X POST http://127.0.0.1:18700/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"周报","page":1,"pageSize":5}' \
| python3 -c "
import sys,json
for x in json.load(sys.stdin)['data']['results']:
    print('score=%.4f  confidence=%.4f  %s' % (x['score'], x['confidence'], x['fileName']))
"
```

看两点：`confidence` 第 1 条恒 `1.0000`、末条恒 `0.0000`（min-max 归一化的恒定端点，
与质量无关）；`score` 才是可比的绝对量（但只在同一 embedding 配置内可比，**不要**展示给用户）。

## 六、测试 3：普通操作不受影响

改 Top-K / 改排除规则 / 点「恢复默认」等操作只影响索引与检索，不改变宿主其它页面行为；
插件不写宿主状态、不读宿主私有存储。

## 七、已知限制

| 现象 | 原因 | 处理 |
|---|---|---|
| 插件页显示「服务不可用」| filesearch 服务未运行 / 未登录 | `systemctl --user status bibit-filesearch` |
| 设置里无「文件检索」| 插件未安装 / 未被信任 / GUI 未重启 | 确认 `/usr/lib/bibit/plugins/` 有 tgz；受信清单里 keyId 与插件签名一致；重启 GUI |
| 结果里混着明显无关的内容 | **语义门槛标定失效**（噪声与真实命中的分数区间重叠）；知识库里的短测试文件也会拿到高分 | 已知问题，见 [`acceptance.md`](acceptance.md) 第 4 节；不要依赖门槛过滤噪声 |
| 改了插件源码但界面没变 | 插件跑的是打包产物 `dist/plugin.js` | 重打 deb + 重装 + 重启 GUI |
| 检索很慢 / 大库内存高 | 块向量全部载入内存做 numpy 余弦（候选池 `search.candidate_pool`，默认 1000），本仓没有 ANN 扩展可降级 | 属当前设计；调小 `candidate_pool` 可换速度，代价是深排能力 |
