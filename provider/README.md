# Accept Sovereign Intents

Make your service OPP-compatible in 10 minutes. The equivalent of "accept Bitcoin here" for the sovereign internet.

When a sovereign agent sends an intent to your service, this template handles identity verification, intent parsing, terms negotiation, and signed responses. You add your data.

## Quick Start

```
cp provider-template.js my-service.js
```

Edit three things:

1. Your service name and description
2. Your `resolve` function — what your service actually does
3. Your terms — what you offer and what you need

Start:

```
node my-service.js
```

Your service is now OPP-compatible. Any sovereign agent can discover it, negotiate with it, and query it.

## What This Handles For You

- Ed25519 signature verification on incoming requests
- OPP manifest at `/.well-known/opp.json`
- Intent parsing and routing
- Terms negotiation (propose → counter → accept)
- Signed response envelopes
- Agent identity extraction from headers

## What You Provide

- A `resolve(intent)` function that returns your data
- A `terms` object describing what you offer
- Your domain knowledge
