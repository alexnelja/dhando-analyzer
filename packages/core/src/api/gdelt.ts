const BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';

export interface GdeltArticle {
  title: string;
  url: string;
  seenDate: string;
  domain: string;
  tone: number;
}

export function createGdeltClient() {
  async function fetchJson(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GDELT API error: ${response.status}`);
    }
    return response.json();
  }

  return {
    async queryEvents(query: string, daysBack: number = 7): Promise<GdeltArticle[]> {
      const params = new URLSearchParams({
        query,
        mode: 'ArtList',
        maxrecords: '250',
        timespan: `${daysBack}d`,
        format: 'json',
      });
      const data = await fetchJson(`${BASE_URL}?${params}`);
      const articles = data?.articles ?? [];
      return articles.map((a: any) => ({
        title: a.title ?? '',
        url: a.url ?? '',
        seenDate: a.seendate ?? '',
        domain: a.domain ?? '',
        tone: parseFloat(a.tone) || 0,
      }));
    },

    async countMentions(query: string, daysBack: number = 30): Promise<number> {
      const events = await this.queryEvents(query, daysBack);
      return events.length;
    },
  };
}
