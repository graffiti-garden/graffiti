# Schema compilation browser benchmark

This compares the API implementation at `e2b7451e2` with the working API source. It uses a public People-page schema and synthetic values, fresh opaque sandbox frames, and the actual Graffiti iframe RPC wrappers. Both modes use the current site-scoped guard permission implementation.

From the repository root after installing dependencies:

```sh
node api/benchmarks/schema-cache/build.mjs
node api/benchmarks/schema-cache/server.mjs
```

Open `http://127.0.0.1:4178/?rounds=3` in a foreground Chromium tab. The page runs automatically and saves each result to the ignored `results/` directory. `?only=depth1` or `?only=cloned` selects a subset. Analyze a result with:

```sh
python3 api/benchmarks/schema-cache/analyze.py results-file.json
```

The build records source-baseline and bundle hashes in the result manifest. It wraps the actual AJV class only to count instances and inspect retained schemas; compilation and validation methods are unchanged. Bundle loading and frame initialization are outside the measured work interval.

The suite alternates modes within each pair and reverses scenario order between rounds. It includes single-call, same-object-identity, cloned-schema, cold-concurrent, and unique-schema controls. RPC trials use one or four real message boundaries, repeated or distinct queries, and a validation-disabled transport control. The in-memory kernel replaces the network backend. These are browser mechanism measurements, **not end-to-end Social.Wiki load times**.

Every validator checks valid and invalid synthetic data; RPC trials check result counts. Compatibility probes cover local references and separately compiled root/nested identifiers after eviction. Long-task observations are per frame and can overlap; their durations must not be added. `hostElapsedMs` includes deliberate observer-flush waits and is diagnostic only; use `ms` and `firstMs` for workload timing.

The anonymous object-schema cache is bounded to 128 entries, including eviction from AJV's identity cache. The two boolean schemas are retained separately because AJV's `removeSchema` does not accept booleans; this adds at most two entries. Explicitly named schemas retain AJV's existing registration lifetime because other compile calls may reference them. Consequently explicit named registrations remain unbounded, as before. Invalid anonymous schemas are removed when compilation fails. Literal objects containing `$id` inside schema data do not become named registrations.

An earlier experiment used an obsolete shape-based guard policy from another branch. Its combined API/permission results do not apply to this change and are excluded here. The deployed guard and current main use site-scoped permissions. The API lazy-initialization race and cloned-schema compilation pattern remain in both current main and the captured deployed bundle.

All fixture values are synthetic. The server binds only to `127.0.0.1`; the benchmark never contacts production services or changes account data.

## Recorded Chromium result

Chromium 152 on macOS, foreground regular profile, three alternating pairs per scenario, 2026-11-12. All 62 trials and reference checks completed successfully. Run identifier: `2026-11-12T17-17-28-352-`.

| Workload                                   | Baseline median | Patched median |
| ------------------------------------------ | --------------: | -------------: |
| 32 concurrent cold calls                   |        111.4 ms |         8.6 ms |
| 80 cloned copies of one schema             |         54.9 ms |        10.1 ms |
| 80 calls using the same schema object      |         10.4 ms |         8.2 ms |
| 150 distinct schemas                       |        108.1 ms |       108.1 ms |
| 12 queries × 20 objects through 1 RPC hop  |         24.9 ms |        16.5 ms |
| 12 queries × 20 objects through 4 RPC hops |         41.9 ms |        33.1 ms |
| 4-hop RPC with validation disabled         |         25.6 ms |        25.8 ms |

The cold-concurrent case creates 32 AJV instances in the baseline and one with the fix. Repeated cloned calls retain 81 entries including the meta-schema in the baseline and two with the fix. The 150-distinct-schema case retains 151 versus 129 entries and shows no median speed improvement. Cold-concurrent and cloned-schema cases produced baseline tasks over 50 ms; their patched runs did not.

For 4-hop repeated RPC, the first result changed only from 13.8 to 12.7 ms; most of the benefit was finishing the repeated compilation work. Other small differences are within the variation expected from three pairs. These figures describe controlled synthetic workloads, not measured page-call counts or page-load savings.
