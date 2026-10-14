# bibit-filesearch-plugin

桌面应用 **BiBit** 的「文件检索」插件：在 BiBit 里提供 **bibit-filesearch**（本地语义检索引擎）
的配置、索引状态与检索验证界面。

插件是**纯前端 contribution + deb 打包**，不含检索逻辑本身；真正的索引 / 向量 / 检索都在
后端服务 `bibit-filesearch` 里。本仓产出的是一个**已签名的插件包**
（`filesearch-0.1.0.bibit-plugin.tgz`），由 deb 装到 `/usr/lib/bibit/plugins/`，
BiBit 启动时发现、验签、解包并渲染。

| | |
|---|---|
| 插件 id / 版本 | `filesearch` / `0.1.0`（manifest `bibit.feature.json`） |
| 呈现位置 | BiBit **设置 → 功能 → 文件检索** |
| SDK 契约 | `@bibit/feature-contracts` `0.3.0`、`sdkApiVersion: 1` |
| 语言 | 跟随宿主，拥有 `en` / `zh-CN` |
| 后端 | `bibit-filesearch`（独立 deb，user systemd 服务，默认 `127.0.0.1:18700`） |

---

## 一、它解决什么

后端 `bibit-filesearch` 会索引你的知识库目录并用自然语言检索本地文件，但它本质是个服务，
平时只能靠 `curl` 用。本插件把它的四件事搬进 BiBit 图形界面：

```
┌──────────────────────────── 文件检索页（本插件） ────────────────────────────┐
│ ① 概览       状态 / 已索引文件 / 待向量化 / 未纳入索引 / 失败文件   ← 一眼看健康度  │
│ ② 索引配置   知识库路径·深度·返回条数·排除规则·格式·自动索引        ← 改完点一下生效  │
│ ③ 检索验证   输入关键词直接搜，看命中与名次                        ← 验证索引是否真生效│
│ ④ 明细面板   失败文件 / 未纳入索引（文件名 + 原因）                 ← 出问题能定位    │
└──────────────────────────────────────────────────────────────────────────┘
```

本插件只负责**界面**，直接 `fetch` 后端的 HTTP 接口：

```
BiBit 设置 → 功能 → 文件检索
      │ fetch http://127.0.0.1:<port>
      ▼
bibit-filesearch(:18700)
      │ POST /v1/embed/embeddings
      ▼
embedding 端点（默认 `127.0.0.1:18790`，OpenAI 兼容）→ 端侧 embedding 模型
```

宿主若还提供对话式入口，它同样落到 `bibit-filesearch` 的同一套接口；本插件只负责设置页。

---

## 二、页面能力

### 概览（5 格统计）

| 格 | 含义 |
|---|---|
| 状态 | 与服务同源的单一状态：`服务正常` / `连接中…` / `扫描中` / `已暂停` / `已完成` / `索引服务不可用` / `索引出错` / `服务不可用` |
| 已索引文件 | 已入库文件数 |
| 待向量化 | **还有多少没算完**（后端 `pending` = 排队 + 正在算；不是只数「排队」那个偏小的口径）|
| 未纳入索引 | 目录里存在但没建索引的文件数（格式未勾选 / 解析不出文字 / 命中排除规则 / 超出深度 / 非 UTF-8 文件名），可展开看明细 |
| 失败文件 | 失败文件数 = 明细条数（后端 `scanPhase.errorDetails`，与展开的列表**同源同长**），可展开按「权限 / 解析 / 向量化 / 其他」看原因 |

扫描期间状态格下方给出进度：遍历阶段显示「正在遍历文件 x / N」，向量化阶段显示
「已处理 x / N 个文件（待 P）」并带进度条；两个阶段不混排，不会出现「扫描中 + 100%」
这种自相矛盾。

### 索引配置

标题行：**自动索引**开关 · **恢复默认** · **保存并索引**（改动后出现「有未保存的更改」标记）。

| 项 | 说明 |
|---|---|
| 知识库路径 | 可多个目录；绝对路径，目录不存在会拦下 |
| 索引深度 | `0` = 不限层数；`1` = 仅当前目录；`N` = 当前目录 + N-1 层子目录 |
| 检索返回条数（Top-K） | 单次检索**最多返回**多少条，不影响排序 |
| 排除规则 | 每行一条 glob，按路径任一分量匹配；默认 `.git` / `node_modules` / `__pycache__` |
| 支持格式 | 四组共 20 类，见下；点开「图片」有 OCR 较慢的提示 |
| 自动索引 | 开启后监听目录，新增 / 修改 / 删除实时更新，无需手动重建 |

支持格式（20 类）：文档 `txt md docx pdf` · 代码 `py js java cpp c cs go rs ts sql sh json`
· 表格演示 `xlsx pptx` · 图片 `png jpg`（走 OCR，可搜图中的文字）。

**保存**会把表单值写进 `~/.config/bibit-filesearch/config.yaml` 并触发重扫；
**恢复默认**清空用户自定义键、回落到内置默认并重扫，是**两段式确认**（第一次点变红
「再点一次确认」，第二次才执行；可点「取消」或改任意字段退出确认态）。

### 检索验证

输入关键词（中英文均可）直接查索引，结果为卡片列表：文件名、**名次 `#N`**、类型标签、
大小、更新日期、完整路径。名次是**按相关度排序的位次**，不是「匹配度百分比」
——后端那个百分比是 min-max 归一化产物（每次头名恒 100%），会被误读。

### 明细面板

「失败文件」与「未纳入索引」两个面板结构一致：**两列（文件名 │ 原因）**，固定高度、
框内滚动、条数不影响整框高度；两面板共用列轨道，跨面板也逐列对齐。原因按当前语言出词。

### 刷新状态

页面每 2 秒后台轮询一次，所以「刷新状态」按钮的增量只是**不必等最多 2 秒**。点击后
有明确反馈：`⟳ 正在刷新…`（≥420ms，避免一闪而过）→ `✓ 已刷新`（保持 1.4s 后回原位）
或 `✕ 刷新失败`（失败必须可见，不静默）。请求只有十几毫秒，若不设下限会只闪一帧。

---

## 三、默认配置（后端出厂默认）

界面首次打开时生效的值全部来自后端代码默认（用户文件里只存**改过的键**）：

| 键 | 默认值 |
|---|---|
| `index_dirs` | 动态：当前用户的 `~/Documents`（目录存在才给） |
| `max_depth` | `3` |
| `top_k` | `5` |
| `auto_index` | `true` |
| `exclude_patterns` | `.git` / `node_modules` / `__pycache__` |
| `indexable_types` | 20 类全选（含 `png` / `jpg`） |

「恢复默认」后配置文件只剩 `config_version` 一行，这是**稀疏存储的应有形态**，不是配置丢失——
生效值由 `curl http://127.0.0.1:18700/api/settings` 给完整结果。

---

## 四、安装

### 前置

后端服务必须已装并运行：

```bash
dpkg -l bibit-filesearch                     # 服务包
curl -s http://127.0.0.1:18700/health        # {"code":0,...,"status":"ok"}
```

### 方式一：deb（推荐，随系统升级管理）

```bash
sudo dpkg -i bibit-filesearch-plugin_<版本>_all.deb
```

deb 内容只有一件：把签名好的 `filesearch-0.1.0.bibit-plugin.tgz` 装到
`/usr/lib/bibit/plugins/`（BiBit 的**系统插件目录**）。

### 方式二：手动放 tgz

```bash
npm run build:plugin
sudo cp artifacts/filesearch-0.1.0.bibit-plugin.tgz /usr/lib/bibit/plugins/
```

### ⚠️ 装完要做的两件事

**1. 重启 BiBit。** 插件只在 GUI 启动时被同步、验签、解包，`dpkg -i` 本身**不会**让运行中的
界面改变。

**2. 确认信任链。** 宿主用 `/usr/lib/bibit/resources/plugin-trusted-keys.json` 里的公钥验签；
本插件的 keyId 是 `filesearch-development`。公钥不在受信清单里 → 宿主**静默拒绝**（界面无入口、
日志无报错）。
**自己 `keygen` 生成的 key 必须把新公钥加进受信清单**，否则装上也看不见入口（见「构建与打包」）。

### 生效链路

```
dpkg -i
  └─→ /usr/lib/bibit/plugins/filesearch-0.1.0.bibit-plugin.tgz   （系统插件目录）
        │  启动 BiBit 时 sync_system_plugins 发现 → 验签 → 解包
        ▼
/home/<user>/.local/share/BiBit/data/plugins/installed/filesearch/0.1.0/
  ├── plugin.json      ← 含各文件的 files 哈希（宿主加载契约）
  ├── plugin.sig
  └── dist/plugin.js   ← 界面真正跑的那份产物
```

> 手动替换产物时**必须整目录替换**（`plugin.json` + `plugin.sig` + `dist/` 三件自洽）：
> `plugin.json` 里记的文件哈希不符 → 宿主静默拒收，界面入口直接消失。

### 验证是否装好

```bash
# 1) 装机版本
dpkg-query -W -f='${Package} ${Version}\n' bibit-filesearch-plugin

# 2) GUI 加载的产物目录存在
ls /home/<user>/.local/share/BiBit/data/plugins/installed/filesearch/0.1.0/dist/plugin.js

# 3) 信任链：宿主受信清单里有本插件的 keyId
python3 -c "import json;print([k['keyId'] for k in json.load(open('/usr/lib/bibit/resources/plugin-trusted-keys.json'))['keys']])"
```

### 卸载

```bash
sudo dpkg -r bibit-filesearch-plugin
# 已解包到用户目录的副本不在 deb 生命周期内，需要时手动清：
rm -rf /home/<user>/.local/share/BiBit/data/plugins/installed/filesearch
```

---

## 五、开发

```bash
npm install          # 依赖（@bibit/feature-* 走 vendor/ 下的源码包）
npm run dev          # 浏览器 Dev Host（dev/main.tsx），直连本地 :18700
npm run typecheck    # tsc --noEmit
npm test             # 单元测试：79 例（scripts/run-tests.mjs → esbuild → node --test）
```

`npm run dev` 起的是 **FeatureDevHost**（`:5173`），在普通浏览器里渲染同一个
`FilesearchPage`，不开 BiBit 也能调界面；它直接请求本机 `:18700`，不需要后端 mock。

`npm test` 不用 `node --test --experimental-strip-types`（该环境下 Node 未编译 TS 支持）：
脚本改用仓库已有的 esbuild 把 `tests/*.test.ts` 打包成临时 `.mjs` 再跑。

测试覆盖（`tests/`）：客户端端口派生与 reset 流程、状态机（刷新反馈、恢复默认确认）、
进度视图（增量 / 待向量化两口径）、明细文案、文案 parity。

---

## 六、构建与打包

```bash
npm run build:dev        # 前端产物 → dist/（Dev Host 用）
npm run build:plugin     # 签名插件包 → artifacts/filesearch-0.1.0.bibit-plugin.tgz
dpkg-buildpackage -b -us -uc -d    # 本地打 deb（等价 CI：debian/rules）
```

- **签名私钥不入库**：`build:plugin` 需要一把签名私钥
  （`.bibit-keys/<keyId>-private.pem`）。首次构建前生成一把自己的：

  ```bash
  npm run keygen      # 生成 .bibit-keys/，keyId = filesearch-development
  ```

  生成的私钥只属于本机。要让宿主接受这个包，得把新公钥加进宿主受信清单
  （`plugin-trusted-keys.json`），否则宿主静默拒绝；换 keyId 时同步改 `package.json`
  里 `keygen` / `build:plugin` 的参数。
- **`artifacts/` 不入库**：`debian/rules` 打包时现场 `npm install && npm run build:plugin`
  重新签名生成，保证 deb 里的 tgz 永远与当前代码一致。
- **私钥缺失 = 构建报错**：`debian/rules` 显式检查私钥文件，缺失即 fail 并提示先跑
  `npm run keygen`，不静默跳过。
- **deb 版本号必须高于源上已发布版本**，否则 `apt upgrade` 会把改动整体回退掉。

### 依赖锁定

- **`node_modules/` 与 `vendor/` 入库**：本仓面向 riscv64 离线构建环境（无法访问公网
  npm registry），故依赖随仓库分发，clone 后即可 `dpkg-buildpackage`。
- `@bibit/feature-*` 是宿主的插件 SDK，以 `file:vendor/*.tgz` 形式固定版本（`0.3.0`），
  由 `scripts/pack_vendor.py` 打出，避免上游漂移。

产物：`bibit-filesearch-plugin_<版本>_all.deb`，内容 =
`/usr/lib/bibit/plugins/filesearch-0.1.0.bibit-plugin.tgz`。

### 离线构建

依赖随仓库分发（`node_modules/` + `vendor/`），干净 clone 即可 `dpkg-buildpackage`。
唯一的本地前提是先 `npm run keygen` 生成签名私钥。

---

## 七、目录结构

```
src/
├── plugin.tsx            # registerFeaturePlugin 入口；导出宿主读取的 pluginLocales
├── feature.tsx           # FeatureModuleV1：settings.home → FilesearchPage
├── FilesearchPage.tsx    # 文件检索页主体（概览 / 配置 / 明细面板 / 检索验证）
├── filesearchClient.ts   # bibit-filesearch HTTP 客户端（含端口派生）
├── scanProgress.ts       # 后端进度 → 视图模型（增量 / 待向量化两口径）
├── refreshFeedback.ts    # 「刷新状态」三相位状态机（busy ≥420ms / done 1.4s）
├── resetConfirm.ts       # 「恢复默认」两段式确认状态机
├── detailText.ts         # 明细（失败 / 未纳入索引）分类与文案
├── locales/              # en / zh-CN 文案 + 归一化与取词（语言跟随宿主）
└── filesearch.css        # 样式（.fs-* 命名空间）
tests/                    # 单元测试（*.test.ts）
dev/main.tsx              # 浏览器 Dev Host 入口
vendor/                   # @bibit/feature-* 源码包（scripts/pack_vendor.py 打）
scripts/pack_vendor.py    # vendor 打包脚本
scripts/run-tests.mjs     # 测试入口（esbuild + node --test 封装）
.bibit-keys/              # 签名私钥与公钥（不入库；npm run keygen 生成）
artifacts/                # build:plugin 产物（不入库）
debian/                   # dpkg 打包（标准 deb 骨架 + 定制 rules）
docs/                     # 文档（索引见下）
bibit.feature.json        # 插件清单（id / 版本 / contributions / locales）
```

---

## 八、约定

- 只维护前端 contribution，**不导入 BiBit 私有源码**。
- 状态语义**单一来源**：顶部胶囊与概览「状态」格共用同一套映射，禁止各自映射后端字段。
- 计数与明细**同源**：展示的数字必须等于可展开明细的条数。
- CSS 收口到 `.fs-*` 命名空间，不覆盖宿主全局选择器。
- 语言由宿主经 contribution props 下发（`language`），插件**不读宿主 localStorage、不轮询**。
- 改动前跑 `npm test` + `npm run typecheck`；交付前再跑 `npm run build:dev`、`npm run build:plugin`。
- 签名私钥（`.bibit-keys/`）不入库；构建产物 `artifacts/` 也不入库。

---

## 九、文档

**入口**：[`docs/README.md`](docs/README.md)（文档索引与阅读顺序）。

| 文档 | 内容 |
|---|---|
| [`docs/README.md`](docs/README.md) | **文档索引**（先读这个） |
| [`docs/manual-test-cases.md`](docs/manual-test-cases.md) | 功能自测用例表（发布前自测） |
| [`docs/acceptance-test.md`](docs/acceptance-test.md) | 端到端集成验收 |
| [`docs/acceptance.md`](docs/acceptance.md) | 各功能项的验收判据（回归时逐项核对） |
| [`docs/design-detail-panels.md`](docs/design-detail-panels.md) | 明细面板（失败 / 未纳入索引）设计 |

后端接口契约（权威基准，跨仓）在 `bibit-filesearch` 仓的 `docs/api-contract.md`；
索引状态语义在 `docs/scan-status-contract.md`。

---

## 十、故障排查

| 现象 | 先查什么 |
|---|---|
| 设置里没有「文件检索」 | tgz 在不在 `/usr/lib/bibit/plugins/`；keyId 是否在受信清单；**是否重启过 BiBit** |
| 页面显示「服务不可用」 | `systemctl --user status bibit-filesearch`；`curl :18700/health` |
| 显示「索引服务不可用」 | embed 端点不可达（默认 `127.0.0.1:18790`），看 `/health/deep` 的 `embed` |
| 改了源码但界面没变 | 界面跑的是打包产物 `dist/plugin.js`：需重打 deb + 重装 + 重启 GUI |
| 改了 Top-K 页头数字没变 | Top-K 是**上限**，命中本来就少时数字不变是正常的；判据是 `N ≤ Top-K` |
| 搜出明显无关的内容 | 已知问题（后端语义门槛标定失效），见 [`docs/acceptance.md`](docs/acceptance.md) 第 4 节 |
| 装完入口消失且日志无报错 | `plugin.json` 的 `files` 哈希与磁盘不符 → 宿主静默拒收；整目录重装副本 |
