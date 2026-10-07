import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { siteStatusInterceptor } from '@anotoki/lib/migrations';
import { provideSiteStatus } from '../site-status.config';

/**
 * The anotoki library's migrations module, wired as app.config.ts wires it,
 * for a spec that draws the gate or the library's pages, or that runs what
 * tells SiteStatus where the site stands: HttpClient with the library's
 * interceptor, on the testing backend (a spec answers through
 * HttpTestingController, or leaves a request unanswered: the site's state
 * then stays 'unknown', and the gate shows the pages), and this app's config
 * (core/site-status.config.ts). A spec sets the state with
 * `TestBed.inject(SiteStatus).report('update_pending')` or `.markReady()`.
 */
export function provideTestSiteStatus(): (Provider | EnvironmentProviders)[] {
  return [provideHttpClient(withInterceptors([siteStatusInterceptor])), provideHttpClientTesting(), provideSiteStatus()];
}
