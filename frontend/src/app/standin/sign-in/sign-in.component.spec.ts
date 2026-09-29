import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { SignInComponent } from './sign-in.component';

/**
 * The IAM sends the browser back to /auth/callback with an error, for a
 * sign-in this page started (its state waiting in sessionStorage, as the SDK
 * keeps it): the real SDK finishes that callback, then the Sign in page shows.
 */
async function comeBack(error: string, description: string): Promise<HTMLElement> {
  const clientId = `academy-test-${Math.random().toString(36).slice(2, 10)}`;
  const state = `state-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(`anotoki-auth:${clientId}:login:${state}`, JSON.stringify({ verifier: 'v', nonce: 'n', returnTo: '/', createdAt: Date.now() }));
  history.replaceState(null, '', `/auth/callback?error=${error}&error_description=${encodeURIComponent(description)}&state=${state}`);
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ mode: 'iam', issuer: 'https://iam.test', clientId }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  ) as unknown as typeof fetch;
  const auth = TestBed.inject(AuthService);
  await auth.init();
  expect(auth.state()).toBe('signed-out');
  const fixture = TestBed.createComponent(SignInComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('SignInComponent: a sign-in that came back without one', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
    history.replaceState(null, '', '/');
  });

  it('cancelled at the IAM: the IAM’s own sentence, and nothing more', async () => {
    const el = await comeBack('access_denied', 'The sign-in was cancelled');
    expect(el.querySelector('.err')?.textContent?.trim()).toBe('The sign-in was cancelled.');
    expect(location.pathname, 'the callback left the address bar').toBe('/');
  });

  it('refused by the IAM: the refusal, as the IAM says it', async () => {
    const el = await comeBack('access_denied', 'This account cannot use Japanese Academy');
    expect(el.querySelector('.err')?.textContent?.trim()).toBe('This account cannot use Japanese Academy.');
  });

  it('any other failure: signing in did not work, and why', async () => {
    const el = await comeBack('server_error', 'The IAM could not finish the sign-in');
    expect(el.querySelector('.err')?.textContent?.trim()).toBe('Signing in did not work: The IAM could not finish the sign-in');
  });
});
