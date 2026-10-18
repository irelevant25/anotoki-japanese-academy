import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ANOTOKI_LEGAL_CONFIG } from '@anotoki/lib/legal';
import { academyLegalPagesConfig } from './legal-facts';

/**
 * The legal pages' frame - Terms, Privacy and Contact, the anotoki family's
 * pages (@anotoki/lib/legal/pages, each a lazy route of its own in
 * app.routes.ts): the page's own column (`.wrap`), under the app's top bar and
 * above its foot (app.component, whose foot links to them), and the pages'
 * facts, which only they read (legal-facts.ts) - loaded with the first of
 * them that is opened, out of the first load.
 *
 * Anybody may read them, signed in or not, a visitor or not: what an app keeps
 * is said before anybody signs in to it. So no guard stands in front of them,
 * AppComponent draws them whatever the sign-in says (but a start that could
 * not reach its server at all: the problem page), and nothing here asks for a
 * sign-in or for anybody's study. While the site is not ready, the family's
 * status page stands instead of them, as instead of every page.
 */
@Component({
  selector: 'app-legal-frame',
  imports: [RouterOutlet],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: academyLegalPagesConfig }],
  templateUrl: './legal-frame.component.html',
  styleUrl: './legal-frame.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalFrameComponent {}
