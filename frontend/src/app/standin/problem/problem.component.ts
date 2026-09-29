import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/** The app could not start: the server did not answer, or not as it should. What happened, and nothing else. */
@Component({
  selector: 'app-problem',
  templateUrl: './problem.component.html',
  styleUrl: './problem.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProblemComponent {
  readonly auth = inject(AuthService);

  retry(): void {
    location.reload();
  }
}
