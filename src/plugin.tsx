import { registerFeaturePlugin } from '@bibit/feature-plugin-sdk'
import type { FeatureManifestV1 } from '@bibit/feature-contracts'
import manifestJson from '../bibit.feature.json'
import { featureModule } from './feature'
import { pluginLocales } from './locales'

// 宿主加载器从插件 bundle 读取此命名导出，经 registerFeatureLocales('filesearch', …)
// 注册为 i18next namespace 'filesearch'（供 filesearch:title / filesearch:description）。
export { pluginLocales }

registerFeaturePlugin({ manifest: manifestJson as FeatureManifestV1, module: featureModule })
