import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { AuthService } from '../auth.service';

/** Who is signed in, top right (auth mode iam): their IAM account page, and Sign out. */
@Component({
  selector: 'app-account-menu',
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  readonly auth = inject(AuthService);
  private readonly menu = viewChild.required<ElementRef<HTMLDetailsElement>>('menu');

  readonly name = this.auth.displayName;
  readonly initial = computed(() => ([...this.name()][0] ?? '?').toUpperCase());
  readonly sub = computed(() => this.auth.user()?.sub ?? '');

  logout(): void {
    void this.auth.logout();
  }

  /** The menu closes on a click elsewhere, and on Escape. */
  @HostListener('document:click', ['$event'])
  @HostListener('document:keydown', ['$event'])
  close(event: Event): void {
    const menu = this.menu().nativeElement;
    if (!menu.open) {
      return;
    }
    if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.contains(event.target as Node)) {
      menu.open = false;
    }
  }
}
