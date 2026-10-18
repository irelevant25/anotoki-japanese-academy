import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeedbackPageComponent } from '@anotoki/lib/admin/feedback';

/**
 * /admin/feedback — the messages people sent with Feedback (the family's
 * footer of every page), for the administrators (ADMIN alone: the route and the server
 * both say so): the anotoki library's page (<anotoki-feedback-page>, from
 * @anotoki/lib/admin/feedback - an entry point of its own, so the page stays
 * out of the first load; the same on every anotoki site), in the admin
 * panel's frame. By status, kind, section and a search; a message opened is
 * read; Mark as, Delete. No mail is sent for a message: the panel's Feedback
 * link counts the new ones (the top bar). An admin page, in English.
 */
@Component({
  selector: 'app-feedback',
  imports: [FeedbackPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
})
export class FeedbackComponent {}
