# Security

Mellu.mate runs commands on your computer: your project's checks, and the hooks that guard
them. A flaw here can matter, so please report one in private.

## How to report

Email **degoncore.official@gmail.com** with:

- what you found, and which version (`/plugin` lists it),
- the steps to make it happen,
- what an attacker could do with it.

Please do not open a public issue for a security problem. You will get an answer within
seven days. When the fix is released, the release notes credit you, unless you ask not
to be named.

## What counts

- A way to make the verify gate run a command the user did not approve.
- A way around the guards, such as reading `.env` or a force push that should be blocked.
- A skill, recipe or hook that sends data off the machine without saying so.
- Anything in the vendored skill under `skills/humanizer/`. Report it upstream too.

## Supported versions

Only the latest release gets fixes. Update Mellu.mate from the `/plugin` menu.
