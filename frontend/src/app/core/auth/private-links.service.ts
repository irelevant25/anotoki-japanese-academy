import { inject, Injectable, Injector } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import { AuthService } from './auth.service';
import { VisitorKey } from './visitor-key';

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

/** The code of a failure's JSON body (a copy is read), or ''. */
async function codeOf(r: Response): Promise<string> {
  const body: unknown = await r
    .clone()
    .json()
    .catch(() => null);
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : '';
}

/** The file name a download names itself (Content-Disposition), or null. */
export function fileNameOf(response: Response): string | null {
  const m = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
  return m ? m[1] : null;
}

/**
 * What a report that could not be had is called, by its status alone: the
 * report's address answers plain English text and no code, so there is
 * nothing else to word it from. 404 is a report that is not there (or is
 * somebody else's); anything else is the general sentence.
 */
export function failureKey(status: number): string {
  return status === 404 ? 'report.notFound' : 'error.unknown';
}

/**
 * The links the browser would follow by itself to somebody's data: an exam's
 * report (/report/:id). A link can't carry the token, so a click fetches the
 * report with it (AuthService.fetch()) and opens it from memory, in a new tab
 * (a blob: address, with its no-script policy). The server sends a report with
 * the same policy. A visitor's report goes with their key instead (VisitorKey,
 * made only then), and a key the server no longer knows is forgotten. (The data file of Your data is fetched the same way, by its
 * card: home/your-data.)
 *
 * What it says itself — the waiting tab's title, the alert when it fails — is
 * worded at the moment it is raised, in the language on the page; the server's
 * own English sentence is never shown. Nothing at all while the site is being
 * updated (or lost its settings): the anotoki library's page takes the app's
 * place and says so (AuthService.fetch() told it), and nobody is to read an
 * error about it.
 */
@Injectable({ providedIn: 'root' })
export class PrivateLinksService {
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);
  private readonly injector = inject(Injector);

  /** For (click) on such a link: fetched with the token instead of followed. */
  click(event: MouseEvent, url: string): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.open(url);
  }

  /** One of the person's own pages (a report), in a new tab, from memory. */
  async open(url: string): Promise<void> {
    // The tab opens during the click itself: later, the browser would block it.
    const tab = window.open('', '_blank');
    if (tab) {
      tab.document.title = this.i18n.t('report.opening');
    }
    try {
      const visitor = this.auth.visiting() ? this.injector.get(VisitorKey) : null;
      const key = visitor?.current() ?? null;
      const r = await this.auth.fetch(url, {}, key);
      if (visitor && key && r.status === 401 && (await codeOf(r)) === 'visitor_unknown') {
        visitor.forget(key, true);
      }
      if (!r.ok) {
        const code = await codeOf(r);
        if (code === 'update_pending' || code === 'not_set_up') {
          tab?.close();
          return;
        }
        this.failed(tab, failureKey(r.status));
        return;
      }
      const blob = await r.blob();
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
