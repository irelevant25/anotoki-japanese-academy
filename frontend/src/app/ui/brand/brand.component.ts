import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The anotoki mark and the wordmark beside it: "anotoki" and the app's name
 * ("Japanese") — the anotoki family's brand (the IAM's UI kit, as the survey
 * has it). On a phone the app's name alone stands beside the mark
 * (`showName` false).
 *
 * The mark has its own white outline, so it reads on a light and a dark bar
 * alike. Its `alt` is empty: the wordmark beside it says the name, and the
 * link's label (`linkLabel`) says where it goes.
 */
@Component({
  selector: 'app-brand',
  imports: [RouterLink],
  templateUrl: './brand.component.html',
  styleUrl: './brand.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandComponent {
  readonly size = input(32);
  /** "anotoki" in the wordmark; without it, the app's name alone beside the mark. */
  readonly showName = input(true);
  /** The app, after "anotoki": a name, the same in every language. */
  readonly area = input.required<string>();
  readonly link = input.required<string>();
  readonly linkLabel = input.required<string>();
  /** The page is the one the brand links to (the home page): aria-current. */
  readonly current = input(false);
}
