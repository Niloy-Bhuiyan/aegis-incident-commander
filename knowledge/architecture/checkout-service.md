---
title: checkout-service Architecture
type: architecture
service: checkout-service
tags: [checkout, pricing, latency, revenue]
---

# checkout-service Architecture

checkout-service owns cart pricing, payment authorisation and order placement.
It is on the revenue path: every failed request here is a lost order.

## Request path

1. Gateway forwards POST /v1/checkout with a validated session token.
2. The service loads the cart, then prices each line item.
3. Stock is reserved via inventory-service.
4. A payment intent is written to payments-db inside a single transaction.
5. The order id is returned.

## Pricing and the N+1 hazard

Line item pricing has historically been the largest latency contributor. The
service is supposed to resolve the whole cart price from the pricing cache in a
single lookup. Any change that moves pricing inside the per-item loop turns one
call into N calls and multiplies p95 latency by roughly the average cart size,
which is between four and six items.

The signature of this regression is a large latency multiplier - typically 4x to
6x - with a broadly unchanged error rate, appearing immediately after a deploy
and affecting no dependency. payments-db and inventory-service stay healthy
because the extra work happens in the cache tier, not the database.

## Capacity

The service runs 12 replicas, each with a 40-connection pool to payments-db.
Saturation above 0.75 usually means requests are queueing on a slow downstream
call rather than on CPU.

## Owned SLOs

- p95 latency 600 ms
- error rate 2.0%

## Common causes of degradation

- A release that adds per-item work to the pricing loop (see INC-2041).
- payments-db latency, which checkout-service inherits at about 75%.
- inventory-service reservation timeouts during stock contention.
