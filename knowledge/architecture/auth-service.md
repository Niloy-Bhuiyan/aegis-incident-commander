---
title: auth-service Architecture
type: architecture
service: auth-service
tags: [auth, jwt, tokens, config]
---

# auth-service Architecture

auth-service issues and validates session tokens for every authenticated route.
It is a hard dependency of the gateway: if token validation fails, essentially
all authenticated traffic fails.

## Token validation

Tokens are JWTs signed with a rotating key. Validation reads the key id from the
token header and looks the public half up in the verification keyset, which is
served from session-cache and refreshed every 60 seconds.

If a token is signed with a key id that is not present in the verification
keyset, validation raises and the service returns HTTP 500 rather than 401,
because an unknown key id is treated as a server-side configuration fault, not a
client error. This distinction matters during triage: a burst of 500s from
auth-service points at configuration, while a burst of 401s points at clients.

## Key rotation

Rotation is a two-step process and the order is not optional:

1. Publish the new public key to the verification keyset and wait for the
   60-second cache refresh.
2. Only then switch jwt_signing_key_id to the new key.

Performing step 2 before step 1 makes every newly issued token unverifiable. The
error rate climbs within seconds and latency barely moves, because the failure
happens early in the request and costs almost nothing to produce.

## Configuration

Runtime configuration lives in the auth-service config bundle, versioned
separately from the binary. jwt_signing_key_id is the highest-risk key in that
bundle. Config changes are reversible with a config revert, which is faster and
lower risk than rolling back the service binary - the binary is not what
changed.

## Owned SLOs

- p95 latency 180 ms
- error rate 1.5%
