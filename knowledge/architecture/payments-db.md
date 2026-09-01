---
title: payments-db Architecture and Capacity
type: architecture
service: payments-db
tags: [database, postgres, connections, saturation]
---

# payments-db Architecture and Capacity

payments-db is the primary PostgreSQL cluster holding orders and payment
intents. It is the only stateful dependency on the checkout path and has no
dependencies of its own, so it is frequently the origin of an incident rather
than a victim of one.

## Connection pool

The primary is configured with max_connections of 120. Two services connect to
it:

- checkout-service: 12 replicas x 40 connections
- inventory-service: 6 replicas x 20 connections

The configured ceiling is therefore well below the theoretical demand. This
works in steady state because read traffic is served by a replica and only
writes reach the primary.

## Replica maintenance is the standing risk

During replica maintenance, read traffic shifts to the primary. Demand for
connections then exceeds max_connections, queries queue for a connection, and
the symptom set is distinctive:

- saturation climbs above 0.90 and stays there
- p95 latency rises several-fold, often 6x to 8x
- error rate rises moderately as callers hit their client-side timeouts
- request rate does not increase - this is not a load spike

Because both checkout-service and inventory-service depend on payments-db, both
degrade at once while their own resource usage looks normal. That fan-out
pattern - two independent dependents degrading together with a shared
dependency at saturation - is the clearest signal that the datastore is the
origin.

## Safe remediation

Raising max_connections on the primary is an online change and is the correct
first response when the pool is the constraint. Restarting the database is not:
it drops in-flight transactions and does not address the ceiling. Scaling out
the callers makes the problem worse by demanding more connections.

## Owned SLOs

- p95 latency 150 ms
- error rate 1.0%
