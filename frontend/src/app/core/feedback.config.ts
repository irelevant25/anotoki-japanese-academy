import { EnvironmentProviders, Injector, inject } from '@angular/core';
import { AnotokiFeedbackConfig, provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { TranslationService } from '@anotoki/lib/translations';
import { AuthService } from './auth/auth.service';

/**
 * The places a message can be about: the app's two sections, as the server
 * takes them (FEEDBACK_SECTIONS, backend/src/admin.php), worded as the top bar
 * words them ("Kanji" is the same in every language).
 */
export const FEEDBACK_SECTIONS = ['Kanji', 'Exam'] as const;

/**
 * The anotoki library's feedback form (@anotoki/lib/feedback/form, every
 * anotoki site's) wired to this app: the form behind "Send feedback" at the
 * foot of every page (core/feedback/feedback-button.component.ts), sent to
 * POST /api/feedback (backend/api/routes/admin.php) - by a person signed in,
 * or, while the IAM does not require signing in here, by a visitor or
 * anybody. No mail is sent: the admin panel's Feedback link counts the new
 * ones (the owner's decision of 2026-10-11).
 *
 *   language   the form's words and the message's language: the language on
 *              the page (English in the admin panel)
 *   translate  the owner's rewording of the form's words (anotoki.feedback.*,
 *              this app's database: the library's anotoki_translations/004)
 *   sections   Kanji and the exam
 *   signedIn   "Send it without my name" is offered
 *   email      a signed-in person's address, written in until they type their
 *              own - or take it out
 *
 * The services are asked for when the form asks, never here (core/site-status.config.ts says why).
 */
export function feedbackConfig(): AnotokiFeedbackConfig {
  const injector = inject(Injector);
  const i18n = (): TranslationService => injector.get(TranslationService);
  const auth = (): AuthService => injector.get(AuthService);
  return {
    language: () => i18n().effectiveLanguage(),
    translate: (key) => i18n().libraryWord(key),
    sections: () => [
      { value: FEEDBACK_SECTIONS[0], label: 'Kanji' },
      { value: FEEDBACK_SECTIONS[1], label: i18n().t('topbar.exam') },
    ],
    signedIn: () => auth().signedIn(),
    email: () => auth().user()?.email ?? null,
  };
}

/** The form, configured for this app (app.config.ts). The form itself loads when somebody opens it. */
export function provideFeedback(): EnvironmentProviders {
  return provideAnotokiFeedback(feedbackConfig);
}
