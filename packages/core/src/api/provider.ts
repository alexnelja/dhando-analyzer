import type { DataProvider, FailoverPolicy, FundamentalsData, PriceData, ProviderResult } from './types.js';

export type { DataProvider, FailoverPolicy };

export function createProvider(policy: FailoverPolicy) {
  async function tryProviders<T>(
    ticker: string,
    method: keyof Pick<DataProvider, 'getFundamentals' | 'getPrice'>
  ): Promise<ProviderResult<T>> {
    const errors: Error[] = [];

    for (const provider of policy.fallbackChain) {
      try {
        const data = await (provider[method] as (t: string) => Promise<T>)(ticker);
        return {
          data,
          source: provider.name,
          fetchedAt: new Date(),
          staleWarning: false,
        };
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    throw new Error(`All data providers failed for ${ticker}`);
  }

  return {
    async getFundamentals(ticker: string): Promise<ProviderResult<FundamentalsData>> {
      return tryProviders<FundamentalsData>(ticker, 'getFundamentals');
    },
    async getPrice(ticker: string): Promise<ProviderResult<PriceData>> {
      return tryProviders<PriceData>(ticker, 'getPrice');
    },
  };
}
