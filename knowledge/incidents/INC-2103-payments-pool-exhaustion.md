---
title: INC-2103 - Payments database connection exhaustion during replica maintenance
type: incident
service: payments-db
tags: [postmortem, database, pool, saturation, capacity]
---

# INC-2103: Payments database connection exhaustion during replica maintenance

Severity SEV1. Duration 47 minutes. Checkout success rate fell to 92.4%.

## Summary

Read replica maintenance shifted read traffic onto the primary. Combined read
and write demand exceeded max_connections of 120. Queries queued for a
connection, payments-db latency rose roughly 7x, and both checkout-service and
inventory-service degraded simultaneously.

## Signals

- payments-db saturation: 0.45 to 0.97, sustained
- payments-db p95 latency: 38 ms to 285 ms, a 7.5x increase
- payments-db error rate: 0.05% to 9.1% as callers hit client-side timeouts
- checkout-service error rate: 0.4% to 7.6%, local resources normal
- inventory-service error rate: 0.2% to 5.6%, local resources normal
- gateway error rate: 0.2% to 6.7%
- request rate: flat - no traffic increase at any tier
- no deploy to any application service in the preceding six hours

## The distinguishing pattern

Two application services that share exactly one dependency degraded at the same
moment while their own CPU and memory looked normal. That fan-out is what
separates a datastore-origin incident from two coincidental service problems.
The absence of any deploy in the window ruled out the most common alternative.

## Root cause

A capacity ceiling, not a code or configuration defect. max_connections had been
sized for the steady state in which reads are served by the replica. The
maintenance runbook did not mention the connection implications of the traffic
shift.

## Resolution

Raised max_connections on the primary from 120 to 300 as an online change.
Saturation fell below 0.70 within two sample windows and both dependent services
recovered without further action.

Two remediations were proposed and rejected during triage:

- Restarting payments-db, which would have aborted in-flight payment
  transactions and left the ceiling unchanged.
- Scaling out checkout-service, which would have opened more connections against
  an already exhausted pool.

## Lessons

- Treat flat request rate as strong evidence. Saturation without a demand
  increase is a supply problem.
- Where a shared datastore is the origin, remediate the datastore. Actions taken
  on the callers either do nothing or make it worse.
