# Contributing to Framefind

Thank you for helping improve a more thoughtful way to rediscover personal footage. Contributions should reinforce the project’s central promise: make media exploration clearer without taking creative authorship away from the creator.

## Before opening a change

Please search existing issues and pull requests first. For a substantial feature, open an issue that explains the creator problem, intended experience, relevant privacy implications, and an MVP-sized acceptance criterion before implementing it.

| Change type | Recommended approach |
| --- | --- |
| Bug fix | Include a reproducible path, the expected behavior, and a regression test when practical. |
| Product feature | Keep the first version narrow. Describe the creator outcome and explicitly list behavior that remains out of scope. |
| AI behavior | Keep credentials server-side, use structured output where appropriate, state what source context reaches the model, and avoid claims beyond the available footage metadata. |
| Visual change | Preserve the nocturnal, editorial visual language and verify desktop plus mobile screenshots before requesting review. |
| Data change | Update `drizzle/schema.ts`, generate and review a migration, and document any data-preservation risk. |

## Development workflow

```bash
pnpm install
pnpm check
pnpm test
```

Use TypeScript throughout, prefer existing UI primitives, and keep server procedures typed through the tRPC router. Video bytes belong in object storage; store only secure storage references and metadata in the database.

## Pull requests

A focused pull request should contain a clear title, a concise summary of user-facing impact, tests for behavior that can be tested deterministically, and screenshots for material UI changes. Do not bundle unrelated refactors with a product change.

Please avoid adding fabricated reviews, testimonials, ratings, or user-generated content to the product or its example data. Sample footage metadata should remain unmistakably labeled as sample content.

## Code of conduct

Be constructive, specific, and respectful. The project welcomes feedback from contributors at every experience level.
