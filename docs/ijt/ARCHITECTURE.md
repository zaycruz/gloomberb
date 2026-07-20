# IJT Terminal ownership architecture

## Decision

The `zaycruz/gloomberb` fork is the IJT-owned runtime. Gloomberb remains the
MIT-licensed upstream and is configured as the `upstream` Git remote. IJT
capabilities are implemented as first-party built-in plugins and backend-owned
services rather than by embedding the former Solid/Tauri application.

## Owned layers

| Layer | Responsibility |
| --- | --- |
| `ijt-brand` | Product identity, config namespace, deep links, release/update origin, installers |
| `ijt-auth` | Supabase password auth, refresh lifecycle, subject binding, protected token storage |
| `ijt-data` | JWT-backed Supabase reads, strict decoders, provenance and freshness |
| `ijt-aurum` | Aurum SSE analyst, workspace context, validated atomic pane actions |
| `ijt-gateway` | Read-only Aurum/IBKR status, refresh, snapshots, analytics and market adapters |
| `ijt-fund-ops` | CAP, NAV and RPT contracts, receipts, reconciliation and operator authorization |
| `ijt-intelligence` | DASH, PREP, TRIAD, COT, FLOW and MACRO |
| `ijt-risk-quant` | RISK, PERF, SIM, BACK and deterministic financial kernels |

## Non-negotiable boundaries

1. External I/O routes through registered capabilities. UI components never
   read credentials or call provider endpoints directly.
2. Supabase access tokens are obtained at request time. Authorization headers
   are never cached, serialized, logged, synced or placed in model context.
3. Secrets do not use plugin config or the ordinary SQLite state store. Until a
   protected native store exists, sessions are memory-only and explicitly
   reported as `volatile`; restart requires sign-in again.
4. Every financial number carries source, `as_of`, freshness and availability.
   Missing data renders unavailable; production mock fallbacks are forbidden.
5. LLMs may explain and orchestrate but never calculate authoritative financial
   metrics. Math remains deterministic and independently testable.
6. Trading and other external side effects remain disabled until an explicit
   human-confirmation and receipt-recovery boundary is implemented.
7. Gloom Cloud, TheBuildout and other hosted upstream services are dependencies,
   not owned assets. Each must be replaced or explicitly optional before IJT
   ownership is considered complete.

## Compatibility policy

- `ijt` is the primary CLI and `~/.ijt-terminal` is the only mutable IJT state.
- `gloomberb` remains a temporary compatibility command.
- Upstream public plugin API names such as `GloomPlugin` are retained while the
  plugin ecosystem depends on them.
- Import from `~/.gloomberb` must be explicit and one-way. The applications must
  never share mutable storage.
- `LICENSE` and upstream history remain intact; see `FORK_NOTICE.md`.

## Runtime configuration

The backend auth capability is enabled only when both
`IJT_SUPABASE_URL=https://aezweyjehriqeadenfjw.supabase.co` and a valid
`IJT_SUPABASE_PUBLISHABLE_KEY` are present. The URL is pinned and the
publishable key is validated before any request. `.env.example` contains
placeholders only; real local environment files remain ignored by Git.

## Migration order

1. Identity, storage namespace, release ownership and attribution.
2. Renderer-safe backend capability invocation.
3. Protected Supabase authentication and fail-closed shell gate.
4. Canonical instruments, IJT data capability and read-only Aurum/IBKR gateway.
5. Aurum analyst and stable pane-instance action translation.
6. Live IJT intelligence and deterministic risk/quant capabilities.
7. Fund Ops read path, then confirmed/idempotent mutation workflows.
8. Remove every production mock and replace all upstream hosted coupling.
9. Signing, notarization, updater, installers and complete parity verification.

## Completion gate

Ownership is complete only when every entry in `capability-manifest.json` is
`verified`, resolves through the command catalog, opens in both OpenTUI and the
desktop renderer, exposes structured headless output where applicable, declares
its side-effect level, shows provenance/freshness, and has no production mock
fallback.
