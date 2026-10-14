# bibit-filesearch-plugin 文档索引

本仓是 **BiBit 桌面应用的「文件检索」插件**（前端 contribution + 签名插件包），
后端服务在 `bibit-filesearch` 仓。插件在界面里的入口是 **设置 → 功能 → 文件检索**
（manifest 里是 `settings` contribution、`navigation.group = "features"`）。

## 权威文档（与实现同步维护）

| 文档 | 内容 | 什么时候读 |
|---|---|---|
| [`manual-test-cases.md`](manual-test-cases.md) | **功能自测用例表**（A 服务与状态 / B 索引配置 / C 恢复默认 / D 检索验证 / E 语言 / F 系统行为 / G 失败与异常），含被测版本、测试数据准备、汇总表 | 发布前自测；接手做验收 |
| [`acceptance-test.md`](acceptance-test.md) | **端到端验收**：BiBit 启动 → 插件页配置 → 检索验证 | 验证整条链路，不只看插件页 |
| [`acceptance.md`](acceptance.md) | **各功能项的验收判据**：索引配置生效性、相关度显示、恢复默认、语言跟随宿主、刷新状态反馈、增量索引状态显示 | 回归这些行为前先读，避免重犯 |
| [`design-detail-panels.md`](design-detail-panels.md) | **明细面板设计**（失败文件 / 未纳入索引）：两列轨道、固定高度、列对齐 | 要动这两个面板时先读 |

后端接口契约（**权威基准**）在 `bibit-filesearch` 仓的 `docs/api-contract.md`；
后端索引状态语义在 `docs/scan-status-contract.md`。

## 约定

- **代码引用只写文件 / 函数 / 类名，不标行号**（行号随重构漂移）。
- 文档写**当前真实行为**：与实现不符的旧结论直接改成正确的，不留新旧对照标记。
- 插件在界面里跑的是**打包产物** `dist/plugin.js`——改源码后必须重打 deb、重装、重启 GUI
  才会生效（同版本号时由 `sync_system_plugins` 按 tgz 的 sha256 判定是否需要重新解包）。
- **跨仓引用要写清是跨仓**：本仓只有 `src/` 下的插件代码，`bibit-filesearch`、宿主 BiBit
  里的路径都不在本仓。
- 新增文档后**回来登记本索引**。
