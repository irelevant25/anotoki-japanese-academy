import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

/**
 * /auth/callback, where the IAM sends the browser back. The IAM's SDK has
 * finished the sign-in before the router started, and put the address the
 * person started from in its place; this route is only ever drawn when there
 * was nothing to finish (an old bookmark, a copy without sign-in): home, then.
 */
@Component({
  selector: 'app-auth-callback',
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
