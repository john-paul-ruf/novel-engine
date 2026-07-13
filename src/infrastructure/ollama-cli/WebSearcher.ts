/**
 * WebSearcher — Lightweight web search for Ollama/llama-server agents.
 *
 * Uses DuckDuckGo's HTML endpoint (no API key required, no rate limits for
 * typical query-manager research usage). Results are parsed and formatted
 * as a text summary suitable for feeding back into the model's context.
 *
 * The search is best-effort — network failures return an error message
 * rather than throwing, so the agent loop continues gracefully.
 */
export class WebSearcher {
  /** Maximum results to return per query. */
  private readonly maxResults: number;

  /** Request timeout in milliseconds. */
  private readonly timeoutMs: number;

  constructor(options?: { maxResults?: number; timeoutMs?: number }) {
    this.maxResults = options?.maxResults ?? 8;
    this.timeoutMs = options?.timeoutMs ?? 15_000;
  }

  /**
   * Execute a web search and return formatted results.
   *
   * Returns a string with numbered results, each containing title, URL,
   * and a snippet. On failure, returns an error message string (not throw).
   */
  async search(query: string): Promise<string> {
    if (!query || !query.trim()) {
      return 'WebSearch error: empty query';
    }

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          'User-Agent': 'NovelEngine/1.0 (research agent)',
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        return `WebSearch error: HTTP ${response.status} from DuckDuckGo`;
      }

      const html = await response.text();
      const results = this.parseDuckDuckGoHtml(html);

      if (results.length === 0) {
        return `No results found for: ${query}`;
      }

      return this.formatResults(query, results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `WebSearch error: ${message}`;
    }
  }

  /** Parse DuckDuckGo HTML results page into structured entries. */
  private parseDuckDuckGoHtml(html: string): Array<{ title: string; url: string; snippet: string }> {
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null && results.length < this.maxResults) {
      const rawUrl = match[1];
      const title = this.stripTags(match[2]).trim();
      const snippet = this.stripTags(match[3]).trim();
      const url = this.extractDuckDuckGoUrl(rawUrl);

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    return results;
  }

  /** DuckDuckGo wraps result URLs in a redirect; extract the actual URL. */
  private extractDuckDuckGoUrl(rawUrl: string): string {
    // DuckDuckGo HTML links look like: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=...
    try {
      if (rawUrl.includes('uddg=')) {
        const params = new URLSearchParams(rawUrl.split('?')[1]);
        const target = params.get('uddg');
        if (target) return decodeURIComponent(target);
      }
      // Some results are direct URLs
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl;
      }
      // Protocol-relative URLs
      if (rawUrl.startsWith('//')) {
        return `https:${rawUrl}`;
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  }

  /** Strip HTML tags and decode basic entities. */
  private stripTags(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ');
  }

  /** Format results as a text summary for the model. */
  private formatResults(query: string, results: Array<{ title: string; url: string; snippet: string }>): string {
    const lines: string[] = [
      `Web search results for: "${query}"`,
      `${results.length} result(s) found:`,
      '',
    ];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`${i + 1}. ${r.title}`);
      lines.push(`   URL: ${r.url}`);
      if (r.snippet) {
        lines.push(`   ${r.snippet}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}