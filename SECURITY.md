# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, report
them privately through GitHub's
[private vulnerability reporting](https://github.com/Anirudh-Gonnuri/Nurdle/security/advisories/new).

Include steps to reproduce and the impact you observed. You should get an
acknowledgement within a few days.

## Scope notes

The Firebase web config in `game.js` (including `apiKey`) is intentionally
public: it identifies the Firebase project and is not a credential. Access to
data is enforced by Firebase Authentication and Realtime Database security
rules. Reports about rules that allow reading or writing data you should not
have access to are in scope; reports that only point out the presence of the
web `apiKey` are not.
