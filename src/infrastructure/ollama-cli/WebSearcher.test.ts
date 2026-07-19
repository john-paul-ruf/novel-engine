import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSearcher } from './WebSearcher';

function resultHtml(entries: { href: string; title: string; snippet: string }[]): string {
  return entries
    .map(
      (e) =>
        `<div><a class="result__a" href="${e.href}">${e.title}</a>` +
        `<a class="result__snippet">${e.snippet}</a></div>`
    )
    .join('\n');
}

function stubFetch(response: Response | (() => Promise<Response>)): ReturnType<typeof vi.fn> {
  const stub = vi.fn(typeof response === 'function' ? response : async () => response);
  vi.stubGlobal('fetch', stub);
  return stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebSearcher', () => {
  it('formats parsed results and decodes DuckDuckGo redirect URLs', async () => {
    stubFetch(
      new Response(
        resultHtml([
          {
            href: '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fagents&rut=abc',
            title: 'Fantasy Agents 2026',
            snippet: 'Agents seeking &amp; accepting <b>fantasy</b> submissions',
          },
          {
            href: 'https://direct.example.org/mswl',
            title: 'MSWL Roundup',
            snippet: 'Manuscript wish lists',
          },
        ]),
        { status: 200 }
      )
    );

    const output = await new WebSearcher().search('fantasy agents');

    expect(output).toContain('Web search results for: "fantasy agents"');
    expect(output).toContain('2 result(s) found:');
    expect(output).toContain('1. Fantasy Agents 2026');
    expect(output).toContain('URL: https://example.com/agents'); // uddg redirect unwrapped
    expect(output).toContain('Agents seeking & accepting fantasy submissions'); // entities + tags cleaned
    expect(output).toContain('URL: https://direct.example.org/mswl');
  });

  it('caps results at maxResults', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      href: `https://example.com/${i}`,
      title: `Result ${i}`,
      snippet: 's',
    }));
    stubFetch(new Response(resultHtml(entries), { status: 200 }));

    const output = await new WebSearcher({ maxResults: 2 }).search('q');
    expect(output).toContain('2 result(s) found:');
    expect(output).not.toContain('Result 2');
  });

  it('URL-encodes the query', async () => {
    const stub = stubFetch(new Response('', { status: 200 }));
    await new WebSearcher().search('C# & "novels"?');

    expect(String(stub.mock.calls[0][0])).toBe(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent('C# & "novels"?')}`
    );
  });

  it('returns error strings instead of throwing: empty query, HTTP error, network failure', async () => {
    const stub = stubFetch(new Response('', { status: 200 }));
    expect(await new WebSearcher().search('   ')).toBe('WebSearch error: empty query');
    expect(stub).not.toHaveBeenCalled(); // no fetch for empty queries

    stubFetch(new Response('teapot', { status: 418 }));
    expect(await new WebSearcher().search('q')).toBe('WebSearch error: HTTP 418 from DuckDuckGo');

    stubFetch(async () => {
      throw new Error('network down');
    });
    expect(await new WebSearcher().search('q')).toBe('WebSearch error: network down');
  });

  it('reports empty result pages', async () => {
    stubFetch(new Response('<html>no result markup here</html>', { status: 200 }));
    expect(await new WebSearcher().search('obscure query')).toBe('No results found for: obscure query');
  });
});
