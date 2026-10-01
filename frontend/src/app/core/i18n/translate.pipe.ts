import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationParams, TranslationService } from './translation.service';

/**
 * `{{ 'example.title' | translate }}`, and with placeholders filled in:
 * `{{ 'example.left' | translate: { n: left } }}`.
 *
 * Impure on purpose. A pure pipe answers from its arguments alone, and the
 * argument here is a constant key — switching the language would change every
 * string on the page while the pipe kept handing back its first answer. The
 * signal read inside t() is what marks the page for another look; being
 * impure is what lets the pipe answer again when it comes. The cost is one
 * map lookup per binding per change detection.
 */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);

  transform(key: string, params?: TranslationParams): string {
    return this.i18n.t(key, params);
  }
}
