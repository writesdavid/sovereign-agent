# sovereign-agent

The internet was built to bend you toward it. Pop-ups, dark patterns, infinite scroll — every surface designed to capture your behavior and convert it into someone else's revenue.

This inverts that.

You state what you want in plain English. Your agent resolves it from verified public data sources, assembles the answer, and returns it to you. No website visited. No tracking pixel fired. No cookie set. Your identity is a cryptographic keypair that never leaves your machine. The data comes back signed so you can verify it yourself.

This is what the internet looks like when it bends toward you.

## Install

```
npx sovereign-agent "Is my water safe? I live in 90210"
```

Or clone and run:

```
git clone https://github.com/writesdavid/sovereign-agent.git
cd sovereign-agent
node bin/sovereign.js
```

Node 18+ required. Zero dependencies.

## What it does

You ask a question. The agent figures out which federal data sources to query, calls them in parallel, verifies the cryptographic signatures on every response, and gives you the answer.

```
$ sovereign-agent "Is my water safe? I live in 49506"

  Resolving intent...
  ├── water ................................ ✓
  └── safety ............................... ✓

  ════════════════════════════════════════════
  RESULTS FOR 49506
  ════════════════════════════════════════════
  Water system found. 0 active violations.
  Confidence: 92%

  • EPA SDWIS (Ed25519 verified)
  ════════════════════════════════════════════
```

```
$ sovereign-agent "Compare 90210 and 10001"

  Resolving intent...
  ├── demographics: 90210 .................. ✓
  ├── demographics: 10001 .................. ✓
  ├── safety: 90210 ........................ ✓
  ├── safety: 10001 ........................ ✓
  └── water, air, hospitals ................ ✓

  All responses cryptographically verified.
```

```
$ sovereign-agent "Watch aspirin for new adverse events"

  ✓ Watching: aspirin adverse events (weekly)
```

## How it works

1. **Identity.** On first run, the agent generates an Ed25519 keypair and stores it at `~/.sovereign/keypair.json`. This keypair IS your identity. No account. No registration. No server stores it.

2. **Intent.** Your plain-English input is parsed locally into a structured intent — which domains to query, which ZIP codes to look up, what to compare. The agent decides what to ask, not a server.

3. **Resolution.** The agent queries the Open Primitive API (`api.openprimitive.com`) across 30 federal data domains — EPA, FDA, NOAA, Census, CMS, SEC, and more. Every response is Ed25519 signed with provenance metadata.

4. **Memory.** Your intent history and active watches are stored locally at `~/.sovereign/memory.json`. Encrypted on your machine. Never uploaded.

## Commands

```
sovereign-agent "your question"     Ask anything
sovereign-agent                     Interactive mode
sovereign-agent --watches           List active monitors
sovereign-agent --history           Past intents
sovereign-agent --identity          Your agent ID and public key
sovereign-agent --export            Export memory as JSON
```

## What you can ask

- **Water safety** — "Is my water safe in 48201?"
- **Air quality** — "How's the air in Los Angeles?"
- **Neighborhood comparison** — "Compare 90210 and 10001"
- **Drug monitoring** — "Watch ibuprofen for adverse events"
- **Hospital quality** — "Best hospitals near 60601"
- **Weather** — "What's the weather in 49506?"
- **Demographics** — "Income and population in 30301"

The agent queries across domains when the question spans them. "Is 49506 a good place to live?" triggers water, air, safety, demographics, and hospitals.

## The Protocol

Read the whitepaper: [SOVEREIGN.md](SOVEREIGN.md)

Sovereign defines four layers. This agent uses all of them.

| Layer | What | Status |
|-------|------|--------|
| Data | Signed, verified responses with provenance | Live — api.openprimitive.com |
| Identity | Ed25519 keypair on your device, no registry | Live — ~/.sovereign/keypair.json |
| Intent | Goal-based queries, resolved across services | Live — plain English in, structured data out |
| Action | Agent acts on your behalf, negotiate terms | Live — watch, compare, monitor |

## Build a Provider

Make your service accept sovereign intents in 10 minutes.

Copy `provider/provider-template.js`. Edit three things: your service name, your terms, and your resolve function. Start the server. Any sovereign agent can now discover and query your service.

See `provider/example-local-weather.js` for a working example.

## Connected

- [Open Primitive Protocol](https://openprimitive.com) — the data layer (30 federal domains, Ed25519 signed)
- [Open Primitive API](https://api.openprimitive.com) — live API
- [MCP Server](https://www.npmjs.com/package/open-primitive-mcp) — 33 agent tools
- [Whitepaper](SOVEREIGN.md) — the full protocol spec

## Sovereignty

Your agent holds its own keys. It decides what to query. It stores its own memory. No platform mediates between you and the data. No service tracks which questions you ask. No algorithm decides what you see.

The internet bends toward you.

## License

MIT
