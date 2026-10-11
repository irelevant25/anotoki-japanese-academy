import { Injectable, computed, inject } from '@angular/core';
import { TranslationParams, TranslationService } from '@anotoki/lib/translations';
import { AuthService } from '../auth/auth.service';
import type { Wording } from '../format';

/**
 * What core/format.ts writes a time with: the words of the language on the
 * page (the anotoki library's translation service: t(), plural(), locale())
 * and the date order and clock a signed-in person chose for their anotoki
 * account, which every anotoki site follows (AuthService.preferences). Null:
 * the language's own way - nobody signed in (a visitor too), an IAM that
 * sends none, or nothing chosen.
 *
 * A component that writes times injects this and hands it to the format
 * functions, inside a computed() or from its template: everything it reads
 * is a signal, so a change of language - or of the account's choice, made on
 * another anotoki site - rewrites the dates on the page as soon as it comes.
 */
@Injectable({ providedIn: 'root' })
export class TimeWording implements Wording {
  private readonly i18n = inject(TranslationService);
  private readonly auth = inject(AuthService);

  readonly dateFormat = computed(() => this.auth.preferences()?.date_format ?? null);
  readonly timeFormat = computed(() => this.auth.preferences()?.time_format ?? null);

  t(key: string, params?: TranslationParams): string {
    return this.i18n.t(key, params);
  }

  plural(key: string, count: number, params?: TranslationParams): string {
    return this.i18n.plural(key, count, params);
  }

  locale(): string {
    return this.i18n.locale();
  }
}
