---
title: INC-2041 - Checkout latency 5x after release 4.9.0
type: incident
service: checkout-service
tags: [postmortem, latency, deploy, rollback, pricing]
---

# INC-2041: Checkout latency 5x after release 4.9.0

Severity SEV2. Duration 34 minutes. Revenue impact: approximately 4,100 orders
delayed, 210 abandoned.

## Summary

Release 4.9.0 moved a price lookup from a single cart-level call into the
per-line-item loop. Average cart size is between four and six items, so each
checkout issued four to six pricing calls instead of one. checkout-service p95
latency went from 214 ms to 1,090 ms - a 5.1x step change - within 90 seconds of
the rollout completing.

## Signals

- checkout-service p95 latency: 214 ms to 1,090 ms, step change
- checkout-service error rate: 0.4% to 0.9%, materially unchanged
- checkout-service saturation: 0.42 to 0.78, requests queueing on the extra calls
- gateway p95 latency: 122 ms to 870 ms, inherited
- payments-db: healthy throughout, p95 stayed near 38 ms
- inventory-service: healthy throughout
- request rate: flat at approximately 320 rps

## What made this hard

The gateway alerted first because it is the customer-facing SLO. Fifteen minutes
went into gateway investigation before anyone checked which of its dependencies
was the origin. The gateway had no dependency-aware view, so the responder had
to correlate by hand.

An unrelated inventory-service deploy landed 90 minutes earlier and was
initially suspected. It was not on the changed path and inventory-service
metrics never moved.

## Root cause

A code change in the deployed artifact. The N+1 pricing pattern was not caught
in review or in load testing, because the staging cart fixture contains a single
item and so produced no measurable difference.

## Resolution

Rolled back to 4.8.3. p95 latency returned to 220 ms within two sample windows.
The fix was rolled forward two days later with a cart-level batch lookup and a
multi-item load test fixture.

## Lessons

- When one application service breaches latency with a flat error rate and
  healthy dependencies, look at what was deployed to that service, not at the
  gateway.
- Roll back first, diagnose after. The rollback took 90 seconds; the diagnosis
  took 25 minutes.
- Scaling out was considered and correctly rejected: the extra work was per
  request, so more replicas would not have reduced per-request latency.
