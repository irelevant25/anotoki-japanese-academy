// Applies the stored light/dark choice before the first paint: this device's
// own, or - for somebody signed in - their anotoki account's, which the app
// writes here whenever it shows it.
//
// The app sets the theme itself once it has loaded (src/app/core/theme/
// theme.service.ts), but that is after the page has been drawn once, and
// somebody who chose dark on a light device would see it flash light on every
// visit. These few lines, loaded from <head> before anything is drawn, close
// that gap. A file rather than an inline script, so a Content-Security-Policy
// that allows scripts from this site only lets it run.
//
// Keep the key and the values in step with theme.service.ts. No choice (the
// system's) is no attribute: the tokens' media query decides.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('academy-theme');
  } catch (e) {
    // Storage switched off: the system decides, through CSS.
  }
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }
})();
