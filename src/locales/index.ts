import { en, type LocaleKey, type EnResource } from './en'
import { zhCN } from './zh-CN'

/**
 * 插件侧 i18n 运行时。
 *
 * 语言通道：宿主把**已解析的最终语言**通过 contribution props 传进来——
 *   契约：packages/feature-sdk/src/feature-module.ts 的
 *   `FeatureRoutedContributionProps.language?: string`
 *   （宿主侧 web-app/src/features/host/FeatureContributionHost.tsx 填
 *    `i18n.language || 'en'`）。所以插件拿到的是 'en' / 'zh-CN' 这类可直接取词的语言，
 *   「系统」那一档已由宿主 web-app/src/i18n/supportedLanguages.ts 的
 *   resolveLanguage 解析掉了——插件不需要、也不应该知道 'system' 这个概念。
 *
 *   语言变化是**推送式**的：宿主 TranslationProvider 因 appliedLanguage 变化重渲染
 *   → FeatureContributionHost 重渲染 → RuntimeElement 的 useLayoutEffect 重设
 *   element.bibitContext → 插件自定义元素的 setter 调 renderPlugin()。
 *   因此插件不轮询、不监听 storage。
 *
 *   不要改回去读宿主的 localStorage：那条路依赖宿主的实现细节（键名 + zustand
 *   persist 的 JSON 形状），拿到的是**偏好**而非最终语言，插件得自己复刻一份
 *   resolveLanguage；宿主哪天改键名就静默失效。
 *
 * pluginLocales 由 src/plugin.tsx 导出，宿主 trustedPluginLoader 读取后经
 * registerFeatureLocales('filesearch', …) 注册为 i18next namespace，
 * 用于渲染导航项标题/描述（filesearch:title / filesearch:description）。
 */

/**
 * 插件拥有词条的语言。必须与 bibit.feature.json 的 locales 一致
 * （有单测守着这条 parity）。
 */
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * 把宿主下发的 language 归一到插件拥有的语言。
 *
 * 输入已是最终语言，故只做「认识就用、不认识回退英文」——回退而不报错，
 * 宿主将来新增语言时插件照常渲染，不会白屏。
 *
 * 注意：这里**不做** 'system' 解析。若宿主误把偏好（'system'）传下来，
 * 那是宿主契约问题，插件按未知值回退英文。
 */
export const normalizeLanguage = (value: unknown): SupportedLanguage =>
  SUPPORTED_LANGUAGES.some((language) => language === value)
    ? (value as SupportedLanguage)
    : 'en'

export type TranslateOptions = Readonly<Record<string, string | number>>

const RESOURCES: Readonly<Record<SupportedLanguage, EnResource>> = {
  en,
  'zh-CN': zhCN,
}

const lookup = (resource: unknown, key: string): string | undefined =>
  key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, resource) as string | undefined

/**
 * 取词。键为编译期受检的 LocaleKey；{{var}} 插值与宿主 setup.ts translate 一致。
 * 目标语言缺词时回退 en；仍缺则返回键本身（不抛错，避免运行时白屏）。
 */
export const translate = (
  language: SupportedLanguage,
  key: LocaleKey,
  options?: TranslateOptions
): string => {
  const text = lookup(RESOURCES[language], key) ?? lookup(RESOURCES.en, key) ?? key
  if (!options) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, variable: string) =>
    options[variable] !== undefined ? String(options[variable]) : match
  )
}

/**
 * 当前语言 + 绑定语言的取词函数。
 *
 * 宿主不向插件暴露 i18next 实例或 t()（FeatureHostApiV1 只有
 * sdkApiVersion / featureId / grantedCapabilities / getCapability），
 * 所以取词在插件内完成，语言由宿主下发。
 */
export const createTranslator = (language: SupportedLanguage) => ({
  language,
  t: (key: LocaleKey, options?: TranslateOptions) => translate(language, key, options),
})

export type Translator = ReturnType<typeof createTranslator>

/**
 * 宿主读取的导出（命名必须精确为 pluginLocales，见 trustedPluginLoader.tsx）。
 * 键 = 插件拥有的语言，与 SUPPORTED_LANGUAGES 同源同序。
 */
export const pluginLocales = {
  en,
  'zh-CN': zhCN,
} satisfies Readonly<Record<SupportedLanguage, unknown>>

export type { LocaleKey }
