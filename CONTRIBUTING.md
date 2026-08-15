# Contributing to SuperTunnel

Thanks for your interest in contributing! We welcome improvements across code, docs, tooling, and examples.

## Getting started
- Fork and clone the repo
- Install dependencies: `pnpm install --frozen-lockfile`
- Run the complete verification pipeline: `pnpm check`
- Build the extension: `pnpm build:extension`
- Load the unpacked extension from `dist-extension/` in Chrome

## Development commands
- `pnpm dev` - Next.js controller API and status dashboard
- `pnpm dev:extension` - watch a self-contained Vite build for the extension; reload it in `chrome://extensions` after changes
- `pnpm lint` - run ESLint
- `pnpm typecheck` - run strict TypeScript validation
- `pnpm build:extension` - build the MV3 extension bundle
- `pnpm check` - run all repository checks and production builds

## Code guidelines
- Use TypeScript and meaningful names; optimize for clarity and readability
- Keep functions small with early returns and clear error handling
- Match existing formatting; avoid large unrelated diffs
- Prefer explicit, typed APIs and avoid `any`
- Validate all data crossing extension, browser, and HTTP boundaries
- Keep requested browser permissions minimal and document new permissions

## Commit and PR process
1. Create a feature branch
2. Keep PRs focused and describe the rationale
3. Include tests or manual verification steps where applicable
4. Link related issues and outline migration notes when needed

## Reporting issues
- Provide environment details (OS, Node, browser)
- Steps to reproduce and expected vs. actual behavior
- Logs, console output, or screenshots if helpful

## Security
If you discover a security issue, please report it privately first. We will coordinate a fix before public disclosure.

## License
By contributing, you agree your contributions are licensed under the MIT License.
