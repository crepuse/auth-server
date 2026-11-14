# Agent Instructions

## Project

`@crepuse/auth-server` is a multi-tenant OIDC identity provider
built with TypeScript ESM.

- Reuse `@crepuse/runtime` for supported runtime abstractions.
- Keep the identity core independent of HTTP frameworks.
- Keep authentication and authorization decisions on the server.
- Prefer small modules with clear responsibilities.
- Follow the existing Prettier and TypeScript configuration.

## Development

- Follow the existing TypeScript conventions and Prettier configuration.
- Use four-space indentation.
- Preserve public API contracts and package entry points.
- Keep provider-specific logic inside its adapter.
- Update documentation when public APIs or behavior change.

## Validation

Run the relevant checks before completing a change:

- `npm run format:check`
- `npm run check`
- `npm test`

## Git and Releases

- Follow the existing feature-branch and PR workflow.
- Target `dev` for ordinary changes.
- Do not create commits, push branches, merge PRs, create tags,
  or publish packages without explicit authorization.
- Treat changes to `main`, package versions, and release workflows
  as release-sensitive operations.
- Never add `Co-authored-by`, `Assisted-by`, `Generated-by`, or similar
  AI attribution trailers to commits, PRs, or source files.
- Preserve the author's existing Git identity and commit metadata.

## Code Review Rules

Prioritize actionable findings involving:

- Runtime correctness and edge cases.
- Public API and TypeScript compatibility.
- Error propagation and data integrity.
- Database consistency and transaction semantics.
- Security and unintended exposure of sensitive data.
- Missing tests for meaningful behavior.

Avoid purely stylistic findings already covered by automated formatting.
