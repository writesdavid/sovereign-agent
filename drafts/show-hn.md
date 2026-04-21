# Show HN Post

**Title:** Show HN: Sovereign Agent – a personal agent that queries federal data, signs everything, and never makes an account

**Body:**

Sovereign Agent is a CLI that takes a plain-English question, resolves it against 30 federal data sources (EPA, FDA, Census, NOAA, SEC, CMS), and returns a verified answer. No browser. No cookies. No tracking. Zero dependencies, Node 18+.

The internet was built to bend you toward brands. Every surface — pop-ups, dark patterns, infinite scroll — exists to capture your behavior and sell it. Sovereign inverts that. You state what you want. Your agent gets it. Nothing else happens.

On first run, the agent generates an Ed25519 keypair and stores it at `~/.sovereign/keypair.json`. That keypair is your identity. No registration, no server stores it. Every API response comes back Ed25519-signed with provenance metadata so you can verify the data yourself. Bitcoin gave self-custody of value. This gives self-custody of identity and intent.

Try it now:

```
npx sovereign-agent "Is my water safe? I live in 90210"
```

Build on it: the `provider/` directory has a template. Edit 3 things — your data source, your transform, your route — and your service speaks the protocol. Every provider signs responses the same way.

- Repo: https://github.com/writesdavid/sovereign-agent
- Protocol spec: https://github.com/writesdavid/sovereign-agent/blob/main/PROTOCOL.md
- Live API: https://api.openprimitive.com

---

# Tweet (X)

Sovereign: a protocol for an internet that bends toward you instead of toward brands. Self-custodied identity. Signed data. No accounts. `npx sovereign-agent` → github.com/writesdavid/sovereign-agent
