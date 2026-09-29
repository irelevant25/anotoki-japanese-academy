import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { NotSetUpComponent } from './not-set-up.component';

describe('NotSetUpComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('points at the setup page, and says why when the server told this computer', async () => {
    TestBed.inject(AuthService).notSetUpReason.set('backend/config/database.local.php is missing');
    const fixture = TestBed.createComponent(NotSetUpComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.btn')?.getAttribute('href')).toBe('/setup.php');
    expect(el.textContent).toContain('not set up yet');
    expect(el.textContent).toContain('Why: backend/config/database.local.php is missing.');
  });

  it('keeps the reason to itself when there is none (a website)', async () => {
    const fixture = TestBed.createComponent(NotSetUpComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Why:');
  });
});
