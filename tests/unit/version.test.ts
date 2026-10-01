import { describe, expect, it } from 'vitest';
import { VERSION } from '../../src/version.js';

describe('version', () => {
  it('exposes the package version as semver', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
