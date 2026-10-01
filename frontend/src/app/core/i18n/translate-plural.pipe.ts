import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationParams, TranslationService } from './translation.service';

/**
 * `{{ 'example.items' | translatePlural: n }}`: the form of a plural family
 * (`.one`, `.few`, `.other`) the number asks for in the language on the page,
 * with the number as `{count}`, written the way that language writes numbers.
 * A third argument carries more placeholders.
 *
 * A family belongs to a place in a sentence, not to a noun: each phrase is
 * complete in its own case. A sentence with two counts is a frame key filled
 * with two such phrases —
 * `'example.line' | translate: { items: ('example.items' | translatePlural: n), parts: ('example.parts' | translatePlural: m) }`.
 *
 * Impure for the reason the translate pipe is: the language changes under a
 * constant key.
 */
@Pipe({ name: 'translatePlural', pure: false })
export class TranslatePluralPipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);

  transform(key: string, count: number, params?: TranslationParams): string {
    return this.i18n.plural(key, count, params);
  }
}
