---
name: deploy
description: Get a project live on the internet for the first time, or ship an update to an existing deployment. Use when the user wants to publish, host, launch, go live, put something online, set up a domain, or asks how other people can actually use what was built.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Deploy

Everything else in easyClaude produces software on one machine. This is the step that makes it a product.

## Deploying is public and often costs money — confirm first

Say what will be deployed, to which host, at what cost, and who will be able to reach it. **Wait for a yes.** Never deploy as a side effect of another task.

Before the first deploy of anything with a login, a database, or a payment path, tell the user to run `/easyclaude:security-check` and wait for the result. A first deploy is exactly when leaked keys stop being theoretical.

## 1. Prove it builds — locally, in production mode

The most common first-deploy failure is a project that runs in dev and cannot build for production. Find that out on your machine, where the feedback loop is seconds.

```bash
npm run build      # or: cargo build --release, flutter build web, go build ./...
```

Then run the full verify contract. Deploying red is worse than not deploying.

## 2. Pick a host from the stack, and give one recommendation

Don't present a menu. Name one, say why in a sentence, and move on.

| Stack | Recommend | Why |
|---|---|---|
| Next.js | Vercel | Built by the same people; zero config |
| Vite / React / SPA / static | Cloudflare Pages or Netlify | Free, fast, trivial |
| Node / Python / Go / Rust API | Railway or Render | Understands a Dockerfile or a start command |
| Needs a database | Railway, or Neon/Supabase for Postgres alone | Managed backups you won't otherwise set up |
| Flutter mobile | TestFlight / Play Console | Weeks, not minutes — see below |
| Unity | itch.io for WebGL builds | Sidesteps store review entirely |

**Be honest about the hard ones.** App-store deploys mean developer accounts (paid), signing certificates, review queues, and days-to-weeks of waiting. If that's the ask, say so up front instead of starting a process that stalls.

## 3. Environment variables — where first deploys actually die

The host does not see `.env`. It is gitignored, and it should be.

1. List every variable the app reads.
2. Have the user set each one in the host's dashboard or CLI. **They enter the values — never ask them to paste secrets into the chat, and never put a secret in a command you run.**
3. Distinguish build-time from runtime variables. `NEXT_PUBLIC_*` and `VITE_*` are baked in at build time — changing them requires a rebuild, not a restart.
4. Check for variables that must differ in production: database URL, callback and redirect URLs, allowed origins, webhook endpoints, API base URLs.

Point 4 is why OAuth "works locally but not in production" — the callback URL is still `localhost`.

## 4. Deploy

**Connect the host to the git repository whenever the project is in git.** Then every push goes live on its own, and the live site cannot fall behind the code. An upload is a copy, and a copy goes stale the first time someone changes the code and forgets to upload again. In testing, a beginner was given a `site/` folder to drag onto Netlify Drop, and the only thing that would have kept their friends off an old version was their own memory.

- **In git, with a GitHub remote:** connect that repository in the host's dashboard. The user signs in and clicks; you say which buttons to press.
- **In git, with no remote:** recommend making one. Say in plain words what it involves: a free GitHub account, a repository, and a push, which puts the code where others can see it unless the repository is private. The user creates the account. Push only after they say yes.
- **Not in git, or the user declines:** an upload is fine. Copy only the files the site needs into a folder, so `docs/`, `.claude/` and other working files stay private, and gitignore that folder. Then add one line to `CLAUDE.md`: the live site is an upload from that folder, so after any change to the site, refresh the folder and remind the user to upload it again. `CLAUDE.md` loads on every turn, so the reminder arrives with the change, not months later.

Watch the build log to completion. A green CLI exit with a failed remote build is a false success.

## 5. Verify the live thing

Do not report success from a dashboard that says "Ready".

- Open the deployed URL and confirm the main path works end to end.
- Check one thing that needs a real environment variable — that proves configuration, not just the build.
- Confirm it works logged out and in a private window. Your own session hides broken auth.

## 6. Write it down

In `docs/ARCHITECTURE.md`: the host, the live URL, where env vars live, and **how to roll back**. Someone will need the rollback under pressure, months from now, with no memory of today.

Add the URL to `README.md`.

## Things worth telling a first-time deployer

- **Free tiers sleep.** The first request after idle can take 30+ seconds. That's cold start, not a bug.
- **Custom domains need DNS**, which propagates on its own schedule. An hour is normal.
- **Rollback beats fixing forward.** Every host in the table above has one-click rollback. Use it, then debug calmly.
- **Deploy small and often.** A deploy containing one change is trivial to diagnose; one containing twenty is not.
