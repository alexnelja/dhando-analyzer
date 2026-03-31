const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredObservation {
  date: string;
  value: number;
}

export function createFredClient(apiKey: string) {
  async function fetchSeries(seriesId: string, limit: number = 10): Promise<FredObservation[]> {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`FRED API error: ${response.status}`);
    const data = await response.json();
    return (data.observations ?? [])
      .filter((o: { value: string }) => o.value !== '.')
      .map((o: { date: string; value: string }) => ({ date: o.date, value: parseFloat(o.value) }));
  }

  return {
    // US macro indicators
    async getVix(): Promise<FredObservation[]> { return fetchSeries('VIXCLS', 30); },
    async getCreditSpread(): Promise<FredObservation[]> { return fetchSeries('BAMLH0A0HYM2', 30); },
    async getYieldCurve(): Promise<FredObservation[]> { return fetchSeries('T10Y2Y', 30); },
    async getFedFundsRate(): Promise<FredObservation[]> { return fetchSeries('FEDFUNDS', 12); },
    async getConsumerSentiment(): Promise<FredObservation[]> { return fetchSeries('UMCSENT', 12); },
    async getM2MoneySupply(): Promise<FredObservation[]> { return fetchSeries('M2SL', 24); },
    async getCPI(): Promise<FredObservation[]> { return fetchSeries('CPIAUCSL', 24); },
    // SA indicators available on FRED
    async getSaRepoRate(): Promise<FredObservation[]> { return fetchSeries('INTDSRZAM193N', 12); },
    async getZarUsd(): Promise<FredObservation[]> { return fetchSeries('DEXSFUS', 30); },
    async getSaCpi(): Promise<FredObservation[]> { return fetchSeries('FPCPITOTLZGZAF', 12); },
  };
}
