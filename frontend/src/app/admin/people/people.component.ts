import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { ApiService, toApiError } from '../../core/api/api.service';
import { Person, VisitorsCount } from '../../core/api/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmComponent } from '../confirm/confirm.component';
import { reason } from '../reason';

/** A moment as the admin area writes it: English, whatever the language on the learner's pages. */
const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** "1 item", "12 items": the admin area's English. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Everybody the site has — whoever signed in once has a row — with how far
 * each has come, for the administrators (ADMIN alone: the route and the
 * server both say so). Deleting a person's data takes all of it — progress,
 * answers, exam attempts and their reports, their row — after a copy of it on
 * the server (backend/storage/backups/academy-before-delete-user-…); the
 * question names what goes. Their IAM account is the IAM's, and stays: when
 * they sign in again, they start afresh. An admin page, in English, with the
 * server's own sentence when it refuses.
 *
 * Visitors — people studying without signing in, where the IAM does not
 * require it — are not in the list (they are nobody's account): one line
 * says how many the site keeps now and the oldest seen, once the database can
 * keep them (GET /api/admin/visitors; nothing when that cannot be had).
 */
@Component({
  selector: 'app-people',
  imports: [ConfirmComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './people.component.html',
  styleUrl: './people.component.scss',
})
export class PeopleComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly confirm = viewChild.required(ConfirmComponent);

  protected readonly people = signal<Person[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  /** What the last delete did, or why it did not: the page's status line. */
  protected readonly done = signal<string | null>(null);
  protected readonly failed = signal<string | null>(null);
  /** The person whose data is being deleted. */
  protected readonly deleting = signal<number | null>(null);
  protected readonly visitors = signal<VisitorsCount | null>(null);

  /** "Visitors (not signed in): 12, the oldest seen 3 Oct 2026, 14:05. …": once the database can keep them. */
  protected readonly visitorsLine = computed(() => {
    const v = this.visitors();
    if (!v || !v.ready) {
      return '';
    }
    const oldest = v.oldestSeenAt === null ? '' : `, the oldest seen ${this.when(v.oldestSeenAt)}`;
    return (
      `Visitors (not signed in): ${v.count}${oldest}. ` +
      `Each is deleted ${count(v.keepDays, 'day', 'days')} after their last visit; at most ${v.max} are kept at a time.`
    );
  });

  async ngOnInit(): Promise<void> {
    const visitors = this.api.visitors().then(
      (v) => this.visitors.set(v),
      () => undefined, // only a line: the page is the people's
    );
    try {
      this.people.set(await this.api.people());
    } catch (error) {
      this.loadError.set(reason(toApiError(error)));
    }
    await visitors;
  }

  /** Their name in the IAM, as it was last seen here; their number when the site never learned one. */
  protected name(person: Person): string {
    return person.username || `user ${person.id}`;
  }

  /** Whether this row is the administrator looking at the page. */
  protected isYou(person: Person): boolean {
    return String(person.id) === this.auth.subject();
  }

  protected when(ms: number | null): string {
    return ms === null ? '—' : WHEN.format(ms);
  }

  protected items(person: Person): string {
    return count(person.items, 'item', 'items');
  }

  protected attempts(person: Person): string {
    return count(person.attempts, 'attempt', 'attempts');
  }

  protected async remove(person: Person): Promise<void> {
    const sure = await this.confirm().ask({
      title: `Delete ${this.name(person)}'s data?`,
      message:
        `Their progress (${this.items(person)} learned), every answer and their ${this.attempts(person)} at the exam, with the reports, go. ` +
        'The server keeps a copy of it first. Their account stays: signing in again, they start afresh.' +
        (this.isYou(person) ? ' This is you.' : ''),
      confirm: 'Delete',
      danger: true,
    });
    if (!sure) {
      return;
    }
    this.deleting.set(person.id);
    this.done.set(null);
    this.failed.set(null);
    try {
      const { copy } = await this.api.deletePerson(person.id);
      this.people.update((people) => (people ?? []).filter((other) => other.id !== person.id));
      this.done.set(`${this.name(person)}'s data is deleted. A copy of it is in backups/${copy}.`);
    } catch (error) {
      this.failed.set(reason(toApiError(error)));
    } finally {
      this.deleting.set(null);
    }
  }
}
