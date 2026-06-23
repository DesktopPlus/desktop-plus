import type {
  ModelBilling as SDKModelBilling,
  ModelInfo,
} from '@github/copilot-sdk'

/**
 * Extra usage-billing metadata currently returned by Copilot model listing
 * responses but not represented in the public SDK ModelInfo type.
 */
export interface ICopilotModelBillingTokenPrices {
  readonly batchSize?: number
  readonly cachePrice?: number
  readonly contextMax?: number
  readonly inputPrice?: number
  readonly outputPrice?: number
}

export type CopilotModelBilling = Omit<SDKModelBilling, 'multiplier'> & {
  readonly multiplier?: SDKModelBilling['multiplier']
  readonly tokenPrices?: ICopilotModelBillingTokenPrices
}

type CopilotModelCapabilitiesLimits = Omit<
  ModelInfo['capabilities']['limits'],
  'max_context_window_tokens'
> & {
  readonly max_context_window_tokens?: number
  readonly max_output_tokens?: number
}

type CopilotModelCapabilities = Omit<ModelInfo['capabilities'], 'limits'> & {
  readonly limits: CopilotModelCapabilitiesLimits
}

/**
 * Desktop consumes a few model-picker metadata fields ahead of the public SDK
 * type surface. Keep them local and optional so the app can handle SDKs that
 * do or do not expose them.
 */
export type CopilotModel = Omit<ModelInfo, 'billing' | 'capabilities'> & {
  readonly capabilities: CopilotModelCapabilities
  readonly billing?: CopilotModelBilling
  readonly modelPickerCategory?: string
  readonly modelPickerPriceCategory?: string
}
