export type {
  AssetProvider,
  ProviderBatchRequest,
  ProviderJobQuery,
  ProviderSubmission,
} from "./types";

/**
 * T008 intentionally ships no paid/remote provider adapter. Implementations must
 * preserve the AssetProvider boundary without persisting URLs, headers, or tokens.
 */
export const REMOTE_PROVIDER_NOT_IMPLEMENTED = true as const;
