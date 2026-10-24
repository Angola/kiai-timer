# Security Policy

Please report vulnerabilities privately via GitHub's "Report a vulnerability" (Security → Advisories) rather than opening a public issue.

Design notes:

- No third-party code is shipped or used at build/test time.
- All persisted / imported data is validated in `app/js/model.js` before use.
- The UI never assigns HTML strings (`innerHTML` etc.); user text is always inserted as text nodes.
- The app makes no network requests besides loading its own static files.
