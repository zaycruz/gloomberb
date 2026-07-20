# IJT to owned Gloomberb migration

Authoritative baselines:

- Owned runtime: Gloomberb `1a44ddffc9c82b3789ffe244102b0522323bbd4a`
- IJT source product: `ijt-terminal` `origin/main` at
  `96ebd3a85321b09ebf0bfdaaf32a2ea763332828`

The old IJT checkout is not the migration target. Models, contracts, tests and
product behavior move into this repository; Solid/Tauri presentation code does
not. Existing Gloomberb panes are retained when they already supersede an IJT
mock or placeholder.

## Capability matrix

| IJT | Current source truth | Owned-runtime target | Work |
| --- | --- | --- | --- |
| GP | Live Yahoo history with synthetic fallback | Existing ticker chart | Add aliases/provenance; remove synthetic fallback |
| FA | Static statements | Existing financials | Replace IJT implementation |
| DES | Static catalog plus quote | Existing overview | Replace static catalog |
| ANR | Hard-coded ratings | Existing analyst research | Replace mock data |
| CN | Yahoo RSS and SEC Atom | Existing news/SEC capabilities | Preserve useful public fallback |
| OMON | Hard-coded options chain | Existing options | Add entitled IBKR provider route |
| HDS | Placeholder | Existing holders/13F | Add IJT alias and verification |
| RV | Placeholder | Existing relative valuation | Add provenance standard |
| SPLC | Placeholder | `ijt-intelligence` supply-chain plugin | Build from primary/licensed sources |
| TOP | Live public RSS | Existing news wire | Add IJT public feeds |
| WEI | Placeholder | Existing world indices | Add IJT alias |
| ECO | Hard-coded calendar | Existing econ plugin | Replace mock data |
| EQS | Placeholder | Aurum-backed screener | Validate every ticker and metric |
| DASH | Live account/NAV shell | `ijt-intelligence` dashboard | Compose fund, broker, macro and news capabilities |
| PREP | Quote plus hard-coded levels/events | `ijt-intelligence` prep | Rebuild from session statistics and calendars |
| TRIAD | Deterministic IJT model | `ijt-intelligence` triad | Port model and alias normalization |
| COT | Live Supabase view | `ijt-data` COT capability and pane | Verify production credentials and desktop rendering |
| FLOW | Hard-coded rows | Owned options-flow capability | Require licensed/BYO data or unavailable state |
| SECT | Placeholder | Existing sectors/heatmap | Add IJT alias |
| CORR | Placeholder | Existing correlation | Add IJT alias and gateway history route |
| MACRO | Live gateway plus regime rules | `ijt-intelligence` macro regime | Port deterministic classifier |
| FEAR | Live gateway score | Existing fear/greed plus Aurum provider | Preserve stronger provenance |
| AI | Placeholder; AgentPanel is live | `ijt-aurum` | Port strict streaming and atomic actions |
| JRNL | Hard-coded trades | Owned journal plugin | Build persistence, imports, stats and export |
| PORT | Live Supabase positions | `ijt-data` canonical snapshot pane | Verify production credentials; add direct-broker mode |
| OPTA | Hard-coded candidates/Greeks | Owned options analysis | Deterministic scoring over real chain |
| RISK | Live deterministic analytics | `ijt-risk-quant` | Port kernels and fixtures |
| PERF | Live deterministic analytics | Existing analytics plus IJT kernels | Consolidate to one canonical implementation |
| BACK | Hard-coded trades | Owned backtesting service | Rebuild with costs, slippage and no look-ahead |
| SIM | Seeded live Monte Carlo | `ijt-risk-quant` | Port simulation and equivalence tests |
| RPT | Live deterministic report | `ijt-fund-ops` report | Add immutable snapshot/export |
| NAV | Live canonical NAV plus broker NLV | `ijt-fund-ops` NAV pane | Verify production credentials; add broker-NLV reconciliation |
| CAP | Authenticated Fund API and five writes | `ijt-fund-ops` operator pane | Expose writes only after receipts/idempotency and all workflows are complete |

Current implementation checkpoints:

- Auth: masked `IJT Login` and explicit `IJT Logout` command-bar workflows
  invoke the backend capability in both renderers; sessions remain volatile.
- TRIAD: deterministic v1 catalog, `TRIAD` pane shortcut, bot-safe text/JSON
  report, backend capability, and live OpenTUI verification are complete.
- CAP: the exact shortcut opens the authenticated Fund workspace with freshness,
  reconciliation, LP, selected-account and transaction projections. Tests cover
  a production-shaped operator projection, and live OpenTUI proves the
  unauthenticated path fails closed. The pane visibly keeps all writes disabled;
  governed command receipts and the six missing workflows remain open.
- SIM: the seeded GBM kernel and percentile/ruin outputs are ported with
  parity tests and a five-million path-day ceiling; portfolio-data wiring and
  the user-facing simulation pane remain open.
- COT/NAV: exact command-bar shortcuts now open authenticated canonical-data
  panes. Component tests cover production-shaped responses and provenance, and
  live OpenTUI checks prove the unauthenticated path fails closed with `IJT
  Login` guidance. Production-data and desktop-renderer verification remain
  open until credentials are available.
- PORT: the exact shortcut now opens a single backend-composed canonical account
  and position snapshot, with tests for production-shaped values and provenance
  plus a live OpenTUI fail-closed check. Existing local portfolio analytics move
  to the explicit `PANL` shortcut instead of competing for `PORT`. Authenticated
  production-data and desktop-renderer verification remain open.

## Cross-cutting migration work

- Replace the numeric-panel Aurum action vocabulary with stable pane instance
  IDs while retaining all-or-nothing simulation before mutation.
- Establish canonical instrument IDs before migrating TRIAD, risk, performance
  or macro. Preserve Bloomberg-style aliases such as `ES1`, `NQ1`, `GC1` and
  `CL1` as aliases rather than provider identifiers.
- Port the Fund API contract exactly, including 1 MiB response bounds, request
  IDs, timeouts with indeterminate outcomes, replay receipts, revisions and
  correction chains.
- Complete the six Fund workflows absent from the current Edge Function:
  commitment create/update, capital-account create/update, transaction reverse
  and transaction replace.
- Replace Tauri release mechanics with Electrobun equivalents while preserving
  signing, notarization, stapling, updater verification and universal macOS
  distribution requirements.
- Remove or explicitly isolate Gloom Cloud clients for cloud data, sync, chat,
  tweets, account management and TheBuildout. Forking the client does not confer
  ownership of those server products.

## Current blockers and risks

- Persistent Supabase login needs a protected native credential store; ordinary
  JSON/SQLite persistence is not acceptable.
- Gloomberb IBKR supports live order placement while IJT is read-only. Execution
  stays off until governed approval is designed and verified.
- Commercial IBKR use and market-data redistribution require provider approval.
- Existing Gloomberb release scripts and many internal strings still use the
  upstream artifact namespace and require staged migration.
