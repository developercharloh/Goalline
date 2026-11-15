---
name: Vercel guest sessions
description: Non-obvious cookie middleware behavior on Vercel.
---

Vercel may populate request cookies before Express middleware runs. cookie-parser skips parsing when cookies already exist, so its signing secret and verified signed cookies may never be set.

**Why:** Guest-session creation worked locally but failed on Vercel with a missing cookie-parser secret despite the environment variable being present.

**How to apply:** Ensure the application's signed-cookie parser actually runs on Vercel requests, and test guest-session creation on the deployed URL rather than relying only on local checks.
