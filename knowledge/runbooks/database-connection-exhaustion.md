---
title: Runbook - Database Connection Exhaustion
type: runbook
service: payments-db
tags: [database, pool, saturation, timeout, runbook]
---

# Runbook: Database Connection Exhaustion

Use this runbook when payments-db breaches its saturation or latency SLO and
more than one dependent service degrades at the same time.

## Confirm the shape

1. payments-db saturation above 0.90, sustained rather than spiky.
2. payments-db p95 latency several times baseline, typically 6x to 8x.
3. Both checkout-service and inventory-service degrading together. They share
   only one dependency, so a simultaneous degradation with healthy local
   resources points at that shared dependency.
4. Request rate flat. Connection exhaustion during maintenance is a supply
   problem, not a demand problem.

## Correlate with the change log

Look for a capacity event rather than a deploy: replica maintenance, a traffic
shift to the primary, or a change to pool sizing. The absence of a recent deploy
to any application service is itself informative - it rules out the most common
alternative explanation.

## Remediate

Increase max_connections on the primary. This is an online change on this
cluster and directly relieves the constraint that is causing queries to queue.

Do not restart payments-db. It drops in-flight transactions on the revenue path
and leaves the ceiling exactly where it was.

Do not scale out checkout-service or inventory-service. More replicas open more
connections against an already exhausted pool and deepen the queue.

Enabling a circuit breaker on the callers is a legitimate blast-radius
mitigation - it stops the datastore problem from consuming caller threads - but
it does not fix the datastore and should not be treated as a resolution.

## Verify recovery

Saturation should drop below 0.75 within one to two sample windows. Both
dependent services should return inside their SLOs. Do not resolve until the
datastore and every dependent are healthy for three consecutive samples.
