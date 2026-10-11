import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslationsPageComponent } from '@anotoki/lib/translations/admin';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { TranslationsComponent } from './translations.component';

describe('TranslationsComponent: the anotoki library’s Translations page, in the admin panel’s frame', () => {
  async function draw(): Promise<ComponentFixture<TranslationsComponent>> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // The learner reads Slovak: the panel stays English all the same.
        provideTestTranslations({}, { language: 'sk' }),
      ],
    });
    const fixture = TestBed.createComponent(TranslationsComponent);
    await fixture.whenStable();
    return fixture;
  }

  it('is the library’s page inside the panel’s frame: its landmark, its width, and English whatever the reader reads', async () => {
    const host = (await draw()).nativeElement as HTMLElement;
    const main = host.querySelector('main');
    expect([main?.className, main?.getAttribute('lang')]).toEqual(['wrap wide admin', 'en']);
    expect(main?.querySelector(':scope > anotoki-translations-page')).not.toBeNull();
  });

  it('asks the page whether it may be left - the library’s guard on the route asks the frame', async () => {
    const fixture = await draw();
    const page = fixture.debugElement.query(By.directive(TranslationsPageComponent)).componentInstance as TranslationsPageComponent;
    const asked = vi.spyOn(page, 'canLeave').mockReturnValueOnce(Promise.resolve(false)).mockReturnValueOnce(true);
    await expect(fixture.componentInstance.canLeave()).resolves.toBe(false);
    expect(fixture.componentInstance.canLeave()).toBe(true);
    expect(asked).toHaveBeenCalledTimes(2);
  });
});
