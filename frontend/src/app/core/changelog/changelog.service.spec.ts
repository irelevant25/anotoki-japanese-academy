import changelog from '../../../../public/changelog.json';
import pkg from '../../../../package.json';
import { ChangelogEntry, compareVersions } from './changelog.service';

describe('the versions: three numbers, MAJOR.MINOR.PATCH', () => {
  it('compared number by number, a missing one 0: "0.4" - the changelog’s way until 2026-10-07 - is the same release as "0.4.0"', () => {
    expect(compareVersions('0.4', '0.4.0')).toBe(0);
    expect(compareVersions('0.4.0', '0.4')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
    expect(compareVersions('0.4.0', '0.4.0')).toBe(0);
    expect(compareVersions('0.4', '0.4.1')).toBeLessThan(0);
    expect(compareVersions('0.5.0', '0.4.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.9')).toBeGreaterThan(0);
    expect(compareVersions('0.10.0', '0.9.0'), 'numbers, not letters').toBeGreaterThan(0);
  });

  it('what is no version is the same only as itself', () => {
    expect(compareVersions('beta', 'beta')).toBe(0);
    expect(compareVersions('beta', '0.4.0')).not.toBe(0);
    expect(compareVersions('', '0')).not.toBe(0);
    expect(compareVersions('0.4.', '0.4')).not.toBe(0);
    expect(compareVersions('v0.4', '0.4')).not.toBe(0);
  });

  it('public/changelog.json: every release with three numbers, the newest first - and the newest is frontend/package.json’s version, the one the foot shows', () => {
    const versions = (changelog as ChangelogEntry[]).map((entry) => entry.version);
    expect(
      versions.filter((version) => !/^\d+\.\d+\.\d+$/.test(version)),
      'not three numbers',
    ).toEqual([]);
    for (let i = 1; i < versions.length; i++) {
      expect(compareVersions(versions[i - 1], versions[i]), `${versions[i - 1]} before ${versions[i]}`).toBeGreaterThan(0);
    }
    expect(versions[0]).toBe(pkg.version);
  });
});
