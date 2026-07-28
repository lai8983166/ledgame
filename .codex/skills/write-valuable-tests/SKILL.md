---
name: write-valuable-tests
description: Evaluate whether unit or integration tests are suitable and worthwhile, then design and implement the lightest focused tests that protect meaningful behavior. Use when planning, writing, or reviewing tests for bug fixes, contracts, invariants, refactors, migrations, concurrency, protocol handling, persistence, lifecycle behavior, or external-failure handling. Exclude real browser end-to-end testing.
---

# Write Valuable Tests

## Global Gate

Before planning or writing any test, explicitly answer:

1. Is this test suitable for the product?
   Match the investment to the product stage, risk profile, stack, and existing repository test practices.
2. Is it worth a test?
   Require a meaningful failure mode that the test can actually catch. Skip trivial behavior, framework guarantees, and tests that only mirror implementation.

Evaluate each candidate behavior independently. Skip a behavior when either answer is no and briefly explain why. If no candidate passes both questions, stop without writing tests.

## Start From A Result

Start from a bug, rule, contract, invariant, or product requirement. Never start from a coverage target.

Choose the result the test protects:

- **Regression lock:** Preserve behavior that mattered after a bug fix, refactor, migration, or dependency upgrade.
- **Correctness check:** Prove behavior against a rule, contract, invariant, or requirement.

State the protected result clearly enough that one test can fail for one recognizable reason.

## Choose The Lightest Method

- Use a unit test when one unit's observable behavior can prove the result with controlled collaborators.
- Use an integration test only when real collaboration between project-owned pieces is the risk, such as route plus service, service plus repository, parser plus serializer, or adapter plus a local test double.
- For regressions, make the focused test fail on the old code when doing so is cheap and deterministic.
- Follow the repository's existing framework, naming, fixture, and assertion conventions.

Use the narrowest stable observable boundary. Prefer public APIs; use a package-level boundary only when it represents the real project contract.

## Keep Tests Focused

- Keep setup small and make each test fail for one clear reason.
- Derive expected results from the requirement or protocol, not from current implementation output.
- Include important adversarial inputs for correctness when relevant: empty, missing, invalid, duplicate, out-of-order, permission-denied, and external-failure cases.
- Add fixtures, mocks, snapshots, or helpers only when they remove obvious repetition in the tests being written.
- Do not add a broad suite when one focused test protects the behavior.
- Make the protected result apparent from the test name and assertions. Add a comment only when that purpose is otherwise unclear.

## Test Concurrency Deterministically

- Prefer latches, barriers, blocking queues, futures, and observable state over arbitrary sleeps.
- Give every wait a finite timeout.
- Prove the required ordering explicitly instead of relying on scheduler timing.
- Close sockets, executors, threads, files, and temporary resources.

## Verify In Layers

1. Run the new test independently.
2. Run the nearest related test suite.
3. Run the full suite when the change affects shared infrastructure, concurrency, persistence, lifecycle transitions, or external protocols.

Report tests that could not run and the remaining risk.

## Boundaries

Cover unit and integration tests only. Use the repository's available browser or end-to-end tooling for real browser flows.

Do not write tests only to satisfy coverage. Do not test private implementation details when a stable observable boundary exposes the same risk.
