import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AdminLanguage } from '../../core/i18n/translation.model';
import { TranslationService } from '../../core/i18n/translation.service';
import { drawKitQuestion, KitQuestion } from '../../core/testing/kit-question';
import { AdminDrafts } from '../admin-drafts.service';
import { LanguagesComponent } from './languages.component';

const ENGLISH: AdminLanguage = { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true };
const SLOVAK: AdminLanguage = { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', enabled: true, sortOrder: 2, seeded: true };
const CZECH: AdminLanguage = { code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false, sortOrder: 3, seeded: false };

describe('LanguagesComponent', () => {
  let fixture: ComponentFixture<LanguagesComponent>;
  let host: HTMLElement;
  let api: { languages: ReturnType<typeof vi.fn>; createLanguage: ReturnType<typeof vi.fn>; updateLanguage: ReturnType<typeof vi.fn>; deleteLanguage: ReturnType<typeof vi.fn> };
  let reloaded: ReturnType<typeof vi.fn>;
  /** The kit's question, drawn over the page as the app draws it (ConfirmService). */
  let question: KitQuestion | null = null;

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string, within: ParentNode = host) => clean(within.querySelector(selector)?.textContent);
  const card = (code: string) => host.querySelector<HTMLElement>(`li[data-code="${code}"]`)!;
  const inputs = (within: ParentNode) => Array.from(within.querySelectorAll<HTMLInputElement>('input[type="text"]'));
  const button = (label: string, within: ParentNode = host) => Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => clean(candidate.textContent) === label);

  async function settle(): Promise<void> {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }

  async function type(element: HTMLInputElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  /** The open question answered by the button with these words. */
  async function answer(label: string): Promise<void> {
    const answers = question!.buttons();
    expect(answers, `${label} among the answers`).toContain(label);
    question!.answer(answers.indexOf(label) === 1);
    await settle();
  }

  async function page(languages: AdminLanguage[] = [ENGLISH, SLOVAK, CZECH]): Promise<void> {
    api = { languages: vi.fn().mockResolvedValue(languages), createLanguage: vi.fn(), updateLanguage: vi.fn(), deleteLanguage: vi.fn() };
    reloaded = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { user: signal({ sub: '1' }), isAdmin: signal(true), subject: () => '1' } },
        { provide: TranslationService, useValue: { reload: reloaded } },
      ],
    });
    fixture = TestBed.createComponent(LanguagesComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    question = drawKitQuestion(host);
    await settle();
  }

  beforeEach(() => {
    sessionStorage.clear();
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    if (typeof proto.showModal !== 'function') {
      proto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
    if (typeof proto.close !== 'function') {
      proto.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    }
  });

  afterEach(() => {
    host.remove();
    question?.remove();
    question = null;
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('is English, and lets only a language that does not come with the app be deleted', async () => {
    await page();

    expect(host.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(text('h1')).toBe('Languages');
    // The admin area's sections are the top bar's links (top-bar.component.spec.ts): the page draws none of its own.
    expect(host.querySelector('a[href^="/admin"]')).toBeNull();
    expect(button('Delete', card('en'))).toBeUndefined();
    expect(button('Delete', card('sk'))).toBeUndefined();
    expect(button('Delete', card('cs'))).toBeDefined();
    // English is always offered: its box cannot be unticked.
    expect(card('en').querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
    expect(card('cs').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  });

  it('adds a new language hidden unless the owner ticks "Offer it to readers right away"', async () => {
    await page([ENGLISH, SLOVAK]);
    const form = host.querySelector<HTMLElement>('section.add')!;
    const offered = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(clean(offered.closest('label')?.textContent)).toContain('Offer it to readers right away');
    expect(offered.checked).toBe(false);

    const [code, name, nativeName] = inputs(form);
    await type(code, 'CS');
    await type(name, 'Czech');
    await type(nativeName, 'Čeština');
    api.createLanguage.mockResolvedValue(CZECH);
    button('Add the language', form)!.click();
    await settle();

    expect(api.createLanguage).toHaveBeenCalledExactlyOnceWith({ code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false });
    expect(text('.status')).toBe('Czech is added, hidden. Write its strings, then offer it.');
    expect(card('cs')).not.toBeNull();
    expect(reloaded).toHaveBeenCalled();
  });

  it('says a code that is not one under the field, and does not send it', async () => {
    await page([ENGLISH, SLOVAK]);
    const form = host.querySelector<HTMLElement>('section.add')!;
    const [code, name, nativeName] = inputs(form);
    await type(code, 'czech');
    await type(name, 'Czech');
    await type(nativeName, 'Čeština');

    expect(text('.err', form)).toContain('two small letters');
    expect(button('Add the language', form)!.disabled).toBe(true);
  });

  it('saves only what changed of a row, and shows a refusal beside it, keeping what was typed', async () => {
    await page();
    const [name, , order] = inputs(card('cs'));
    await type(name, 'Czech language');
    await type(order, '9');

    api.updateLanguage.mockRejectedValueOnce(new ApiError('This is for the site\'s administrators.', 403, { code: 'admin_only' }));
    button('Save', card('cs'))!.click();
    await settle();
    expect(api.updateLanguage).toHaveBeenCalledExactlyOnceWith('cs', { name: 'Czech language', sortOrder: 9 });
    expect(text('.err', card('cs'))).toBe('This is for the site\'s administrators. What you typed is kept.');
    expect(inputs(card('cs'))[0].value).toBe('Czech language');
    expect(TestBed.inject(AdminDrafts).languages()).toEqual({ cs: { name: 'Czech language', nativeName: 'Čeština', sortOrder: '9' } });

    api.updateLanguage.mockResolvedValueOnce({ ...CZECH, name: 'Czech language', sortOrder: 9 });
    button('Save', card('cs'))!.click();
    await settle();
    expect(text('.status')).toBe('Czech language is saved.');
    expect(card('cs').querySelector('.err')).toBeNull();
    expect(TestBed.inject(AdminDrafts).count()).toBe(0);
  });

  it('asks before it is left with a row not saved', async () => {
    await page();
    await type(inputs(card('sk'))[0], 'Slovak (Slovakia)');

    const staying = fixture.componentInstance.canLeave() as Promise<boolean>;
    await settle();
    expect(question!.title()).toBe('Leave without saving?');
    expect(question!.buttons()).toEqual(['Stay here', 'Leave']);
    await answer('Stay here');
    await expect(staying).resolves.toBe(false);
    expect(TestBed.inject(AdminDrafts).count()).toBe(1);

    const leaving = fixture.componentInstance.canLeave() as Promise<boolean>;
    await settle();
    await answer('Leave');
    await expect(leaving).resolves.toBe(true);
    expect(TestBed.inject(AdminDrafts).count()).toBe(0);
  });

  it('deletes a language after asking, and names the copy the server kept', async () => {
    await page();
    api.deleteLanguage.mockResolvedValue({ copy: 'academy-before-language-delete-cs-20261001-120000-000.json' });

    button('Delete', card('cs'))!.click();
    await settle();
    expect(question!.title()).toBe('Delete Czech (cs)?');
    expect(question!.buttons()).toEqual(['Cancel', 'Delete']);
    await answer('Delete');

    expect(api.deleteLanguage).toHaveBeenCalledExactlyOnceWith('cs');
    expect(card('cs')).toBeNull();
    expect(text('.status')).toBe('Czech is deleted. A copy of its strings is in backups/academy-before-language-delete-cs-20261001-120000-000.json.');
  });

  it('offers a language the moment its box is ticked, and puts the box back when the server refuses', async () => {
    await page();
    const box = card('cs').querySelector<HTMLInputElement>('input[type="checkbox"]')!;

    api.updateLanguage.mockRejectedValueOnce(new ApiError('the server does not answer', 0, {}));
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(api.updateLanguage).toHaveBeenCalledWith('cs', { enabled: true });
    expect(card('cs').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(text('.err', card('cs'))).toBe('The server does not answer.');

    api.updateLanguage.mockResolvedValueOnce({ ...CZECH, enabled: true });
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(text('.status')).toBe('Czech is offered to readers now.');
    expect(card('cs').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  });
});
