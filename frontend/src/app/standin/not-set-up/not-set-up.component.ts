import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/**
 * The server answered 503 {"code": "not_set_up"}: this copy has no settings
 * yet (backend/config/*.local.php), or its database is missing or has no
 * tables. The setup page does both. To this computer the server may say why,
 * in a whole clause ("backend/config/database.local.php is missing").
 */
@Component({
  selector: 'app-not-set-up',
  templateUrl: './not-set-up.component.html',
  styleUrl: './not-set-up.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotSetUpComponent {
  readonly auth = inject(AuthService);
}
