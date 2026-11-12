# Channel-attestation verification benchmark

The benchmark compares the verification body at `e2b7451e2` with the working implementation. Both use the same Noble Ed25519 implementation and its existing acceptance rules. It replays full `ObjectEncoding.validate` calls, including content hashes and values, rather than measuring signatures alone.

From the repository root:

```sh
node implementations/decentralized/benchmarks/attestations/build.mjs
node implementations/decentralized/benchmarks/attestations/run-node.mjs
node implementations/decentralized/benchmarks/attestations/server.mjs
```

Open `http://127.0.0.1:4179/` in a foreground Chromium tab. It runs automatically in an opaque sandbox and saves results locally. Both modes receive an unreported warm-up for every scenario. Five measured pairs alternate mode order and reverse scenario order; every trial creates a fresh attestation cache. A wrapper counts calls to the real Noble verifier without changing its behavior. The manifest records the production source hash.

The synthetic pixel-shaped data includes 481 objects from 18 actors, matching the object/actor distribution in a captured public PixelFlip channel. The fixture includes claimed channel names; real inbox candidates can have masked channel lists, so this is not an exact page replay. Two controls contain 64 and four objects with no repeated actor/channel signatures. No production requests or accounts are used. All fixture data is synthetic, and generated bundles/results are ignored by Git.

Analyze either a browser result or `results/node.json` with:

```sh
node implementations/decentralized/benchmarks/attestations/analyze.mjs result.json
```

## Recorded result

Five pairs, 2026-11-12. Chromium 152 regular profile in a foreground tab, no CPU or network throttling. Browser run `2026-11-12T17-31-32-590-` completed all 30 trials. Every trial also rejected deliberately changed object bytes after validation.

| Scenario               | Browser baseline / memo median async wall time | Node baseline / memo median wall time |
| ---------------------- | ---------------------------------------------: | ------------------------------------: |
| 481 objects, 18 actors |                              1623.9 / 329.6 ms |                     472.75 / 88.17 ms |
| 64 objects, 64 actors  |                               296.1 / 290.8 ms |                      65.86 / 63.39 ms |
| 4 objects, 4 actors    |                                 29.4 / 26.9 ms |                        4.82 / 4.44 ms |

The repeated-signature case made 481 verifier calls in every baseline trial and 18 in every memoized trial. All unique-signature controls retained their original verifier-call counts. Browser baseline times varied from 755.6 to 3096.3 ms, while memoized times varied from 223.9 to 370.4 ms; every paired repeated-signature trial improved. These are asynchronous wall times, not browser CPU measurements or page-load forecasts. Browser scheduling and Node execution differ substantially. Node process CPU for the repeated case had a median of 504.13 versus 99.96 ms.

The primary evidence is eliminating duplicate exact verifications while preserving the unique-work controls and full object-validation checks. Full live-page savings remain unmeasured. No task of at least 50 ms was observed in this browser run; expensive asynchronous work can be distributed across many shorter tasks.

## Cache behavior

Only a successful verification of the exact signature bytes, actor string and method-prefixed channel public ID is reused. Inputs are copied before asynchronous verification. Pending identical calls share a promise; false and rejected results are removed. The per-instance cache has at most 1024 entries, limits admitted actor length, and reuses an entry for at most ten minutes. Expired entries are removed on access or evicted by LRU; this is not a promise to erase idle entries after ten minutes.

Storage reads, content hashes, values, claimed channels and private recipient tickets remain validated separately. The cache does not contain object-validity decisions, permissions, DID documents or storage endpoints. Moving storage or changing DID metadata cannot change the cached mathematical result for identical bytes; normal endpoint resolution and current storage validation still run. No cryptographic implementation or acceptance-rule change is included.
