---
name: React Hook Form and Zod
description: A type-compatibility issue between the ProBet Tips form resolver and Zod peer versions.
---

The ProBet Tips artifact's `@hookform/resolvers/zod` types can resolve against a different Zod peer copy than the artifact's direct Zod import. The current form schema is valid at runtime through `parseAsync`; a narrow type cast may be needed when wiring the resolver.

**Why:** TypeScript rejected the Zod schema because the resolver and artifact resolved incompatible Zod type definitions, despite compatible runtime parsing.

**How to apply:** Before upgrading dependencies, inspect the resolver's resolved Zod peer and test actual validation behavior; avoid widening the cast beyond the resolver input.
