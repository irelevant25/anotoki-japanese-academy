import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ANOTOKI_FEEDBACK_CONFIG, feedbackWords } from '@anotoki/lib/feedback';
import { FeedbackFormComponent } from '@anotoki/lib/feedback/form';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { AuthService } from '../auth/auth.service';

/**
 * "Send feedback" at the foot of every page, after the version and What's new:
 * the anotoki library's feedback form (core/feedback.config.ts) in the kit's
 * dialog - a mistake found, an idea, anything else, sent to this site's
 * administrators, who read it on the admin panel's Feedback page.
 *
 * Offered while the app itself is shown - to a person, or to a visitor where
 * the IAM does not require signing in (the server takes the message then from
 * anybody) - and not while the library's page stands in for the app: the site
 * being updated, or not set up. The form's code loads only when somebody opens
 * it (@defer): no first load carries it.
 *
 * Its words are the library's (anotoki.feedback.*: "Send feedback"), which the
 * owner rewords on the Translations page, in the language on the page. The
 * button is the kit's quiet link button (`variant="link" size="sm"`: 44 px to a
 * finger), as What's new beside it.
 *
 * Like the version's button beside it, it keeps every key pressed in it - in
 * the open form too - from `document`, where the reviews and the exam listen:
 * Enter in the form never hands an exam paper in.
 */
@Component({
  selector: 'app-feedback-button',
  imports: [ButtonComponent, DialogComponent, FeedbackFormComponent],
  templateUrl: './feedback-button.component.html',
  styleUrl: './feedback-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': '$event.stopPropagation()' },
})
export class FeedbackButtonComponent {
  private readonly auth = inject(AuthService);
  private readonly site = inject(SiteStatus);
  /** The form's configuration (core/feedback.config.ts): without it - a spec that draws the page without the form - no button. */
  private readonly config = inject(ANOTOKI_FEEDBACK_CONFIG, { optional: true });

  readonly open = signal(false);
  /** The app itself is shown, and the library's page does not stand in for it. */
  readonly offered = computed(() => this.config !== null && this.auth.usable() && !this.site.blocked());
  /** The form's words in the language on the page (the owner's, else the library's), and the language they are in. */
  private readonly said = computed(() => feedbackWords(this.config?.language?.() ?? null, this.config?.words, this.config?.translate));
  /** "Send feedback", and the dialog's heading: the form's own title. */
  readonly title = computed(() => this.said().words.title);
  /** The words' language, for the button: English words on a page in another language say so. */
  readonly lang = computed(() => this.said().lang);
}
