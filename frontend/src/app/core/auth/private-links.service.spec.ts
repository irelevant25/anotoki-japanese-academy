import { fileNameOf, lockDown, REPORT_CSP } from './private-links.service';

const META = `<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">`;

describe('lockDown: a report opened from memory runs no script', () => {
  it('puts the policy right after the doctype', () => {
    expect(lockDown('<!doctype html><html><head><title>t</title></head></html>')).toBe(
      `<!doctype html>${META}<html><head><title>t</title></head></html>`,
    );
    expect(lockDown('\n  <!DOCTYPE html><p>x</p>')).toBe(`\n  <!DOCTYPE html>${META}<p>x</p>`);
  });

  it('before anything else: a script ahead of the page’s own <head>', () => {
    const evil = '<script>window.pwned = 1</script><!doctype html><html><head></head></html>';
    expect(lockDown(evil).startsWith(META)).toBe(true);
  });

  it('and before a character HTML reads as text (a no-break space is not a space to it)', () => {
    expect(lockDown(' <!doctype html><script>x</script>').startsWith(META)).toBe(true);
  });

  it('allows no script at all', () => {
    expect(REPORT_CSP).toContain("default-src 'none'");
    expect(REPORT_CSP).not.toContain('script-src');
  });
});

describe('fileNameOf', () => {
  it('takes the name the server gives a download', () => {
    const r = new Response('{}', { headers: { 'Content-Disposition': 'attachment; filename="kanji-progress-2026-09-29.json"' } });
    expect(fileNameOf(r)).toBe('kanji-progress-2026-09-29.json');
    expect(fileNameOf(new Response('{}'))).toBeNull();
  });
});
