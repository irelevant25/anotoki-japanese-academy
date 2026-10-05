import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService, StartProblem } from '../../core/auth/auth.service';
import { errorKey, errorParams } from '../../core/i18n/error-text';
import { TranslationService } from '../../core/i18n/translation.service';
import { keptWord } from '../kept-word';

/**
 * What a start can fail with, in English, for a page drawn with no strings
 * (keptWord()): the same text as the seeded English. A failure that is not
 * listed is worded as `error.unknown` while there are no strings.
 */
const ENGLISH: Record<string, string> = {
  'error.offline': 'The server does not answer.',
  'error.http': 'The server answered with an error ({status}).',
  'error.unknown': 'Something went wrong.',
  'error.database_unavailable': 'The database is not reachable.',
  'error.server_error': 'Something went wrong on the server.',
  'error.not_up_to_date': 'The database is not up to date with this version of the app yet: an administrator has to apply the update first. Try again later.',
  'boot.problem.migrations': 'Open the Migrations page',
};

/**
 * The app could not start: the server did not answer, or not as it should.
 * What happened, and nothing else — worded here from what the sign-in keeps (a
 * kind and a code, never a sentence), in the language on the page when the
 * browser kept its strings from an earlier visit, in the English written here
 * when it did not. The reason the server gives the owner's own computer, or
 * the IAM's SDK's own message, comes after the page's words, small, and is
 * English whatever the page is in (`lang="en"`).
 *
 * Try again loads the page afresh: only a page load changes this state. A
 * database update waiting (not_up_to_date) gives an administrator a link to
 * the admin panel's Migrations page, where they apply it — a page load too,
 * and that page starts while the update waits
 * (TranslationService.refused()).
 */
@Component({
  selector: 'app-problem',
  templateUrl: './problem.component.html',
  styleUrl: './problem.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProblemComponent {
  readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);

  /** "Japanese Academy could not start: {reason}", the reason a whole sentence of its own. */
  readonly said = computed(() => {
    const problem = this.auth.problem();
    return problem ? keptWord(this.i18n, 'boot.problem.couldNotStart', 'Japanese Academy could not start: {reason}', { reason: this.reason(problem) }) : '';
  });
  /** The server's own reason, or the SDK's: English, and only ever beside the page's words. */
  readonly detail = computed(() => {
    const problem = this.auth.problem();
    return problem && problem.kind !== 'offline' ? problem.detail : null;
  });
  readonly tryAgain = computed(() => keptWord(this.i18n, 'common.tryAgain', 'Try again'));
  /** For an administrator, while a database update waits for them: the way to apply it. */
  readonly migrations = computed(() => {
    const problem = this.auth.problem();
    const waiting = problem?.kind === 'server' && problem.code === 'not_up_to_date';
    return waiting && this.auth.isAdmin() ? keptWord(this.i18n, 'boot.problem.migrations', ENGLISH['boot.problem.migrations']) : null;
  });

  retry(): void {
    location.reload();
  }

  private reason(problem: StartProblem): string {
    switch (problem.kind) {
      case 'offline':
        return keptWord(this.i18n, 'error.offline', ENGLISH['error.offline']);
      case 'signIn':
        return keptWord(this.i18n, 'boot.problem.signIn', 'Signing in could not be set up.');
      case 'server': {
        const key = errorKey(problem);
        return keptWord(this.i18n, key, ENGLISH[key] ?? ENGLISH['error.unknown'], errorParams(problem));
      }
    }
  }
}
