import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { isAdminAddress, TranslationService } from './translation.service';

/** The app's name: a name, the same in every language. */
export const BRAND = 'Japanese Academy';

/** Between an admin page's title and the app's name: the anotoki family's name for the area, English as the area is. */
export const ADMIN_PANEL = 'Admin panel';

/** What a key looks like (namespace.thing): how a route's title that is a key is told from one that is a word. */
const KEY_SHAPE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9][A-Za-z0-9_-]*)+$/;

/**
 * "Exam · Japanese Academy": a page's own title first, where a tab shows the
 * start of it; the home page is the app's name alone. An admin page has the
 * area's name between: "People · Admin panel · Japanese Academy".
 *
 * A route's `title` is a translation key (`title.exam`), a term that is the
 * same in every language ("Kanji"), or plain English on the admin pages;
 * a route without one is the app's name. The title follows the language:
 * switching it renames the tab without a navigation.
 *
 * With no strings at all (the first request failed) a title that is a key is
 * left out — the name alone, never "title.exam" on a tab. With strings, a key
 * that has none shows as itself: the owner wants to see which.
 *
 * It also tells the translation service that the page has moved, and where
 * to (the admin area reads in English), which is when that one asks again for
 * strings it could not get — it cannot ask the
 * Router itself (the Router builds this strategy, and this strategy needs that
 * service).
 */
@Injectable()
export class AcademyTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(TranslationService);

  /** The current route's title as the route wrote it. Undefined: the route has none. */
  private readonly page = signal<string | undefined>(undefined);
  /** The page is in the admin panel. */
  private readonly admin = signal(false);

  constructor() {
    super();
    effect(() => this.title.setTitle(this.worded(this.page())));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.i18n.noteAddress(snapshot.url);
    this.i18n.navigated();
    this.admin.set(isAdminAddress(snapshot.url));
    this.page.set(this.buildTitle(snapshot));
  }

  private worded(page: string | undefined): string {
    if (page === undefined) {
      return BRAND;
    }
    if (KEY_SHAPE.test(page) && !this.i18n.ready()) {
      return BRAND;
    }
    const title = KEY_SHAPE.test(page) ? this.i18n.t(page) : page;
    return this.admin() ? `${title} · ${ADMIN_PANEL} · ${BRAND}` : `${title} · ${BRAND}`;
  }
}
