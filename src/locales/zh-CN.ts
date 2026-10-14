import type { LocaleShape, EnResource } from './en'

/**
 * 简体中文资源。文案取自 i18n 改造前的 FilesearchPage.tsx 硬编码字符串，
 * 逐条原样保留（含「」全角引号与标点）。
 *
 * `satisfies LocaleShape<EnResource>` 保证与 en 键集合完全一致：
 * 缺键或多键都会在 typecheck 阶段报错。
 */
export const zhCN = {
  title: '文件检索',
  description: '索引并检索本地文档（bibit-filesearch 独立服务）',
  subtitle: '管理本地文档索引（bibit-filesearch 独立服务）',
  refreshStatus: '刷新状态',
  // 点击反馈三相位：点下去就该看见「正在刷新」，结束时看见「已刷新」。
  refreshStatusBusy: '正在刷新…',
  refreshStatusDone: '已刷新',
  refreshStatusFail: '刷新失败',

  serviceDown: {
    title: '无法连接本地检索服务',
    body: '请确认 bibit-filesearch 服务已启动（{{baseUrl}}）。本页仍可编辑配置，服务恢复后点击「保存并索引」即可生效。',
  },
  retry: '重试',

  // embed 依赖不可用并入「状态」语义，不单列横幅
  status: {
    embedDownReason: '向量化服务未启动：{{embedUrl}}',
    failedReason: '{{count}} 个文件索引失败',
  },

  failedFiles: {
    toggle: '查看明细（{{count}}）',
    hide: '收起明细',
    empty: '本次扫描没有记录失败详情',
    dbOnly: '另有 {{count}} 个文件此前索引失败、本轮未重试（记录在库中）。',
    kindPermission: '权限',
    kindEmbed: '向量化服务',
    kindParse: '解析',
    kindOther: '其他',
    // 面板自身要有标识（否则两个框长得一样，分不清打开的是哪个）
    panelTitle: '失败文件',
    // 文件名不是 UTF-8 —— 由后端给结构化事实（kind/encoding/guess/bytes），
    // 文案在这里按语言出词（后端只给结构化事实，不塞中文句子）。
    kindFilename: '文件名',
    reasonUnencodable:
      '文件名不是 UTF-8，无法入库。按 {{encoding}} 读为「{{guess}}」，请重命名后重新扫描。',
    // 解析 / OCR 失败的中文壳 + 原文细节。
    // 现场：界面选中文，明细右侧却是 `Failed to open file '/…' as type pdf.`
    // —— 后端原样给库的报错，界面只能照打。现在细节仍保留（排障要用），
    // 但外面套一句中文，至少知道发生了什么、该找谁。
    reasonParseFailed: '解析失败：{{detail}}',
    reasonOcrFailed: '文字识别失败：{{detail}}',
    // 悬停时补上原始字节（排查用），平时不占版面
    reasonUnencodableFull:
      '文件名不是 UTF-8，无法入库。按 {{encoding}} 读为「{{guess}}」，请重命名后重新扫描。原始字节：{{bytes}}',
  },
  // 不展示「只收录了文件的一部分」这类文案（内容不完整不给最终用户看）；
  // 数据仍在后端接口 vectorizePhase.truncated /
  // truncationDetails，供调试取证。,

  // 与「失败文件」并列的第二个明细面板（未纳入索引的文件也要能点开
  // 看是哪些文件）。后端只给分类（kind / reason），文案在这里按语言给。
  notIndexedFiles: {
    toggle: '查看明细（{{count}}）',
    hide: '收起明细',
    empty: '当前没有未纳入索引的文件',
    countOnly: '共 {{count}} 个文件未纳入索引（本轮明细尚未产生，稍后可再展开）。',
    truncatedNote: '以上只列出 {{shown}} 条，共 {{total}} 个。',
    kindRule: '命中排除规则',
    kindDepth: '超出索引深度',
    kindType: '格式未勾选',
    kindTypeWithExt: '格式未勾选（{{ext}}）',
    kindNoText: '解析不出文字',
    kindOther: '未纳入索引',
    // 面板标识（与「失败文件」区分开）
    panelTitle: '未纳入索引的文件',
    // 每行的右侧说明句（与「失败文件」面板的「说明列」结构对齐）
    reasonRule: '命中排除规则，因此不参与索引。',
    reasonDepth: '超出索引深度，因此不参与索引。',
    reasonType: '格式未勾选，因此不参与索引。',
    reasonNoText: '解析不出文字，因此不参与索引。',
    reasonOther: '未纳入本次索引。',
    summary: '共 {{count}} 个（{{parts}}）',
    summaryJoiner: '、',
  },

  stats: {
    aria: '索引状态概览',
    status: '状态',
    indexed: '已索引文件',
    queued: '待向量化',
    notIndexed: '未纳入索引',
    notIndexedHint:
      '知识库目录里存在、但没有建立索引的文件：格式未勾选、解析后没有文字（如扫描版 PDF）、命中排除规则、超出索引深度、或不在知识库路径内。',
    failed: '失败文件',
    progressAria: '索引进度 {{pct}}%',
    progressWalking: '正在遍历文件 {{done}} / {{total}}',
    progressFiles: '已处理 {{done}} / {{total}} 个文件（待 {{pending}}）',
  },

  pill: {
    down: '服务不可用',
    connecting: '连接中…',
    done: '已完成',
    scanning: '扫描中',
    paused: '已暂停',
    error: '索引出错',
    idle: '服务正常',
    embedDown: '索引服务不可用',
    doneWithFailures: '已完成',
  },

  config: {
    aria: '索引配置',
    title: '索引配置',
    save: '保存并索引',
    saving: '保存中…',
    unsaved: '有未保存的更改',
  },

  // 恢复出厂默认（就地二次确认，不用原生 confirm）
  reset: {
    button: '恢复默认',
    confirm: '再点一次确认',
    resetting: '恢复中…',
    hint: '清除全部自定义设置，回落到内置默认值',
    warning: '这会清除全部自定义设置（路径、深度、返回条数、排除规则、格式、自动索引）并回落到默认值；不在默认路径下的文件会从索引中移除。确认请再点一次按钮。',
    cancel: '取消',
    done: '已恢复默认配置，正在重新扫描并建立索引',
  },

  errors: {
    readConfig: '读取当前配置失败：{{message}}',
    pathRequired: '请至少填写一个知识库路径',
    dirInvalidPrefix: '知识库路径：',
  },

  notices: {
    saved: '配置已保存，正在重新扫描并建立索引',
    rescanned: '配置未变化，已重新扫描索引',
  },

  scope: {
    title: '扫描范围',
  },

  paths: {
    label: '知识库路径',
    hint: '支持多个目录；每行填写一个绝对路径',
  },

  depth: {
    label: '索引深度',
    hint: '0 = 不限层数（无限深）；1 = 仅索引当前目录本身（不进入子目录）；2 = 当前目录 + 1 层子目录；N = 当前目录 + N-1 层子目录',
  },

  topK: {
    label: '检索返回条数（Top-K）',
    hint: '单次检索最多返回的结果数',
  },

  exclude: {
    title: '排除规则',
    label: '忽略的目录与文件',
    hint: '每行填写一个 glob 规则；匹配到的路径不会进入索引',
  },

  formats: {
    title: '支持的格式',
    hint: '勾选的文件格式才会被索引进知识库',
    selected: '已选 {{selected}} / {{total}}',
    selectAll: '全选',
    clear: '清空',
    groups: {
      docs: '文档',
      code: '代码',
      sheets: '表格 / 演示',
      images: '图片',
      imagesTip: '识别图片中的文字（较慢）；不勾选则图片文字搜不到',
    },
  },

  autoIndex: {
    label: '自动索引',
    hint: '开启后自动监听知识库目录，新增/修改/删除文档会实时更新索引，无需手动重建',
    on: '已开启',
    off: '已关闭',
  },

  verify: {
    aria: '检索验证',
    title: '检索验证',
    matches: '共 {{count}} 条匹配',
    rankHint: '本次检索按相关度排序，这是第 {{rank}} 位——是名次，不是匹配百分比',
    placeholder: '输入关键词检索（中英文均可），例如：GTK 窗口渲染、GPU texture compression',
    search: '检索',
    searching: '检索中…',
    loading: '正在检索本地索引…',
    empty: {
      title: '还没有进行过检索',
      descDown: '服务恢复后，在上方输入关键词即可验证索引是否生效',
      desc: '检索为关键词/语义查询（非对话），输入如「GTK 窗口渲染」直接验证索引效果',
    },
    noResults: {
      title: '没有找到相关内容',
      desc: '可以尝试换一个关键词；若确认内容已在知识库路径中，请点击「保存并索引」重建索引后再试',
    },
    updatedAt: '更新于 {{date}}',
  },
} satisfies LocaleShape<EnResource>
