import type { FeatureModuleV1 } from '@bibit/feature-sdk'
import { FilesearchPage } from './FilesearchPage'

export const featureModule: FeatureModuleV1 = {
  sdkApiVersion: 1,
  pages: {},
  settings: { home: FilesearchPage },
}
