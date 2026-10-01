import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/infra/errors.js';
import { createGitHubClient, formatLocalTime, mapGitHubError } from '../../src/sources/githubClient.js';
import { createFakeFetch, json } from '../helpers/fakeGitHub.js';

const TOKEN = 'ghp_SENTINELtoken0123456789abcdefghijkl';

async function failure(routes: Parameters<typeof createFakeFetch>[0], token?: string) {
  const fake = createFakeFetch(routes);
  const client = createGitHubClient({ token, fetch: fake.fetch, retries: 1, retryAfterBaseValue: 1 });
  try {
    await client.rest.repos.get({ owner: 'o', repo: 'r' });
  } catch (error) {
    return { error: mapGitHubError(error, 'o/r'), requests: fake.requests };
  }
  throw new Error('expected the request to fail');
}

describe('GitHub client', () => {
  it('sends the token as authorization and a docsync user agent', async () => {
    const fake = createFakeFetch({ 'GET /repos/o/r': () => json({ full_name: 'o/r' }) });
    const client = createGitHubClient({ token: TOKEN, fetch: fake.fetch });
    const { data } = await client.rest.repos.get({ owner: 'o', repo: 'r' });
    expect(data.full_name).toBe('o/r');
    expect(fake.requests[0]?.authorization).toBe(`token ${TOKEN}`);
  });

  it('sends no authorization header without a token', async () => {
    const fake = createFakeFetch({ 'GET /repos/o/r': () => json({}) });
    await createGitHubClient({ fetch: fake.fetch }).rest.repos.get({ owner: 'o', repo: 'r' });
    expect(fake.requests[0]?.authorization).toBeNull();
  });
});

describe('mapGitHubError (FR-21, AC8)', () => {
  it('explains an invalid token without printing it', async () => {
    const { error } = await failure(
      { 'GET /repos/o/r': () => json({ message: 'Bad credentials' }, 401) },
      TOKEN,
    );
    expect(error).toBeInstanceOf(SourceError);
    expect(error.message).toMatch(/rejected the token \(401\)/);
    expect(error.message).not.toContain(TOKEN);
  });

  it('explains a missing repository', async () => {
    const { error } = await failure({ 'GET /repos/o/r': () => json({ message: 'Not Found' }, 404) });
    expect(error.message).toBe('repository o/r was not found, or the token has no access to it (404)');
  });

  it('reports when the rate limit resets', async () => {
    const reset = Math.floor(new Date(2026, 9, 1, 14, 32).getTime() / 1000);
    const { error, requests } = await failure({
      'GET /repos/o/r': () =>
        json({ message: 'API rate limit exceeded' }, 403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        }),
    });
    expect(error.message).toBe(
      'GitHub API rate limit reached; it resets at 14:32 (local time). Set GITHUB_TOKEN for a higher limit',
    );
    expect(requests).toHaveLength(1);
  });

  it('retries server errors and then explains them', async () => {
    const { error, requests } = await failure({ 'GET /repos/o/r': () => json({ message: 'boom' }, 502) });
    expect(error.message).toMatch(/server error \(502\) after retries/);
    expect(requests.length).toBe(2);
  });

  it('explains network failures', async () => {
    const { error } = await failure({
      'GET /repos/o/r': () => {
        throw new TypeError('fetch failed', {
          cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
        });
      },
    });
    expect(error.message).toMatch(/could not reach GitHub \(ECONNREFUSED\)/);
  });

  it('keeps an existing SourceError as is', () => {
    const original = new SourceError('x');
    expect(mapGitHubError(original, 'o/r')).toBe(original);
  });

  it('formats local time as HH:MM', () => {
    expect(formatLocalTime(new Date(2026, 0, 1, 9, 5))).toBe('09:05');
  });
});
