# Tracking Links

Before queuing any social media post, create a single tracking link. The current provider is Umami, which captures the referrer automatically -- one link covers all platforms.

**API base:** `https://api.umami.is/v1`
**Auth:** `Authorization: Bearer {UMAMI_API_TOKEN}`

```
POST /links
Body: { "name": "...", "url": "...", "slug": "..." }
```

- Slug must be at least 8 characters
- Naming convention: `{post-slug}` (e.g., `psake-vsc-v1`)
- Short link format: `https://cloud.umami.is/q/{slug}`

```
GET /links           # retrieve all links
DELETE /links/{id}   # clean up
```

Prompt Gilbert to provide `UMAMI_API_TOKEN` when preparing posts for queuing.
