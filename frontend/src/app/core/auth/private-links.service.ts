import { inject, Injectable } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import { AuthService } from './auth.service';

/** A report opened from memory shows as it was saved, but may never run a script. */
export const REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

/**
 * The page with a policy that allows no script, as the first thing the
 * browser reads: right after a leading doctype, or at the very start. A policy
 * counts from where it stands, so never after the page's own <head>: the first
 * "<head" in the text may come after a script. Before the doctype only HTML's
 * own spaces: JavaScript's \s takes characters HTML reads as text, which would
 * put the policy in the body, where it counts for nothing.
 */
export function lockDown(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">`;
  const doctype = /^[\t\n\f\r ]*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + meta + html.slice(doctype[0].length) : meta + html;
}

/** The file name a download names itself (Content-Disposition), or null. */
export function fileNameOf(response: Response): string | null {
  const m = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
  return m ? m[1] : null;
}

/**
 * What a report or a download that could not be had is called, by its status
 * alone: the report's address answers plain English text and no code, so there
 * is nothing else to word it from. 404 is a report that is not there (or is
 * somebody else's); anything else is the general sentence.
 */
export function failureKey(status: number): string {
  return status === 404 ? 'report.notFound' : 'error.unknown';
}

/**
 * The links the browser would follow by itself to somebody's data — a report
 * (/report/:id) and the progress download (/api/kanji/export). Without sign-in
 * they are plain links and work as they always did. Signed in (auth mode iam)
 * they can't carry the token, so a click fetches them with it and opens the
 * report from memory (a blob: address, with its no-script policy), or saves the
 * file under the server's name. The server sends a report with the same policy.
 *
 * What it says itself — the waiting tab's title, the alert when it fails — is
 * worded at the moment it is raised, in the language on the page; the server's
 * own English sentence is never shown.
 */
@Injectable({ providedIn: 'root' })
export class PrivateLinksService {
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);

  /** For (click) on such a link: in auth mode iam, fetched with the token instead of followed. */
  click(event: MouseEvent, url: string, download = false): void {
    if (!this.auth.signsIn() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.open(url, { download });
  }

  /** One of the person's own pages (a report) in a new tab, or a download (the progress file), from memory. */
  async open(url: string, { download = false } = {}): Promise<void> {
    // The tab opens during the click itself: later, the browser would block it.
    const tab = download ? null : window.open('', '_blank');
    if (tab) {
      tab.document.title = this.i18n.t('report.opening');
    }
    try {
      const r = await this.auth.fetch(url);
      if (!r.ok) {
        this.failed(tab, failureKey(r.status));
        return;
      }
      const blob = await r.blob();
      if (download) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileNameOf(r) || 'download';
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        return;
      }
      const page = URL.createObjectURL(new Blob([lockDown(await blob.text())], { type: 'text/html' }));
      if (tab) {
        tab.opener = null;
        tab.location.replace(page);
      } else {
        location.assign(page); // pop-ups blocked: here, then
      }
    } catch (e) {
      // No answer at all, or an answer that could not be read: what it was is for the console, in English.
      console.error('[links] could not open', url, e);
      this.failed(tab, 'error.unknown');
    }
  }

  /** The waiting tab closed, and the browser's own dialog, worded now: "Could not open it: {reason}", the reason a sentence of its own. */
  private failed(tab: Window | null, reason: string): void {
    tab?.close();
    alert(this.i18n.t('report.openFailed', { reason: this.i18n.t(reason) }));
  }
}
