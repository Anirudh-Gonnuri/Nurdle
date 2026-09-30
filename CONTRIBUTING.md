# Contributing to Nurdle

## Development setup

Prerequisites: Node.js 24 (see `.nvmrc`; with nvm run `nvm use`) and git.

```sh
npm install      # installs tooling and the git hooks
npm run dev      # serves public/ at http://localhost:3000
```

The site is plain HTML/CSS/JS in `public/` with no build step; that
directory is exactly what Vercel deploys.

| Script                 | What it does                       |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | Local static server on port 3000   |
| `npm run lint`         | ESLint, failing on any warning     |
| `npm run lint:fix`     | ESLint with auto-fix               |
| `npm run format`       | Rewrite files with Prettier        |
| `npm run format:check` | Verify formatting without writing  |
| `npm run check`        | Lint + format check (what CI runs) |

### Git hooks

Husky installs two hooks on `npm install`:

- **pre-commit** runs ESLint and Prettier on staged files (lint-staged).
- **commit-msg** rejects messages that are not Conventional Commits.

Hooks call the project's local Node binaries, so commit from a shell where
Node 24 is on `PATH`. On WSL, commit from the WSL terminal rather than a
Windows git client, or the hooks will pick up the Windows Node install. GUI
clients that don't load your shell profile can source nvm from
`~/.config/husky/init.sh`.

Run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once so local
`git blame` skips bulk-formatting commits.

## Branching model

| Branch           | Purpose                                    | Deploys to        |
| ---------------- | ------------------------------------------ | ----------------- |
| `main`           | Production. Always releasable.             | Production        |
| `dev`            | Integration. Features land here first.     | Preview / staging |
| `<type>/<topic>` | Short-lived work branches, cut from `dev`. | Per-PR preview    |

Rules:

- Never commit directly to `main` or `dev`. Both are protected and only
  accept changes through pull requests.
- Work branches are created from `dev` and named `<type>/<short-topic>`,
  for example `feat/hard-mode`, `fix/rematch-score`, `chore/eslint`.
- Pull requests into `dev` are **squash-merged** or **rebase-merged** so
  each PR lands as a coherent change.
- Releasing is a pull request from `dev` into `main`, merged with a
  **merge commit** so the release boundary is visible in history.
- Urgent production fixes branch from `main` as `hotfix/<topic>`, merge
  into `main`, then `main` is merged back into `dev`.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <imperative summary, max ~72 chars>

<body: what changed and why, wrapped at 72 columns>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`. Mark breaking changes with `!` after the
type (`feat!: ...`) or a `BREAKING CHANGE:` footer.

Keep commits small and focused: one logical change per commit. Formatting
changes go in their own commit, separate from behavioural changes.

## Pull requests

- Fill in the PR template.
- Keep PRs small enough to review in one sitting.
- **Stacked PRs** (a PR whose base is another work branch): merge the bottom
  PR first, then change the next PR's base to `dev` _before_ merging it.
  Merging a stacked PR while its base is still the old work branch lands
  the changes on that branch instead of `dev`. Enabling "Automatically
  delete head branches" makes GitHub retarget stacked PRs for you.
- CI must pass before merging.
- Resolve all review conversations before merging.

## Continuous integration

GitHub Actions runs on every pull request and on pushes to `main` and `dev`.
The checks marked required must pass before a PR can be merged.

| Workflow            | Job               | What it checks                                               |
| ------------------- | ----------------- | ------------------------------------------------------------ |
| `ci.yml`            | Lint & format     | `npm run lint` and `npm run format:check`                    |
| `ci.yml`            | Commit messages   | Every commit in the PR follows Conventional Commits          |
| `dependency-review` | Dependency review | New dependencies have no moderate+ CVEs or GPL/AGPL licences |

To reproduce a CI failure locally, run `npm ci && npm run check`.

Dependabot opens weekly update PRs against `dev` for npm packages and
GitHub Actions. Actions are pinned to full commit SHAs; Dependabot keeps
both the SHA and the version comment up to date.
