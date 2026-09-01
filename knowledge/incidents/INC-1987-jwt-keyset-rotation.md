---
title: INC-1987 - Auth 5xx spike after signing key rotation
type: incident
service: auth-service
tags: [postmortem, auth, jwt, config, revert]
---

# INC-1987: Auth 5xx spike after signing key rotation

Severity SEV1. Duration 11 minutes. Approximately 96,000 authenticated requests
failed.

## Summary

An operator rotated jwt_signing_key_id to a new key without first publishing the
new public key to the verification keyset. Every token issued after the switch
carried a key id the validator could not resolve, and auth-service returned HTTP
500 for each one. The gateway error rate followed within seconds.

## Signals

- auth-service error rate: 0.1% to 21.4%, step change
- auth-service p95 latency: 61 ms to 84 ms, essentially unchanged
- gateway error rate: 0.2% to 19.1%, inherited
- session-cache: healthy throughout, p95 stayed near 6 ms
- no deploy to any service in the preceding two hours
- auth-service config bundle version changed 200 seconds before the first breach

## Root cause

A configuration change applied in the wrong order. The documented rotation
procedure requires publishing the public key and waiting one 60-second cache
refresh before switching the signing key id. Step two was executed first.

## Why latency did not move

Validation fails at the point where the key id is resolved, which is early and
cheap. The service was not slow; it was failing fast. A near-flat latency curve
alongside a large error spike is the fingerprint of a validation or
configuration fault rather than a saturation or dependency problem.

## Resolution

Reverted jwt_signing_key_id to the previous key. Error rate returned to
baseline within one refresh cycle. The rotation was re-run in the correct order
the following day.

A binary rollback of auth-service was proposed during triage and rejected: the
binary had not changed, so rolling it back would have taken longer and left the
faulty configuration in place.

## Lessons

- Config changes deserve the same scrutiny as deploys during correlation. They
  are versioned separately and are easy to miss when only deploys are reviewed.
- Prefer the narrowest remediation that addresses what actually changed. A
  single-key config revert beat a full binary rollback on both speed and risk.
