---
title: Troubleshooting - Triage Method and Signal Fingerprints
type: troubleshooting
service:
tags: [triage, signals, method, correlation]
---

# Triage Method and Signal Fingerprints

## Order of operations

1. Identify every service currently breaching an SLO.
2. Eliminate the ones explained by propagation. A breaching service whose own
   dependencies are also breaching is downstream of the problem, not the cause.
3. On the remaining origin candidate, read the shape of the signals before
   reading any change log. The shape narrows the class of cause; the change log
   then identifies the specific one.
4. Only then correlate against deploys, config changes and capacity events in
   the 15 minutes before the first breach.

## Signal fingerprints

Latency up several-fold, error rate flat, dependencies healthy, request rate
flat. Class: a local code change. Look at what was deployed to that service.
Extra work is being done per request.

Error rate up sharply, latency flat, dependencies healthy. Class: a validation
or configuration fault. Requests are failing early and cheaply. Look at the
configuration bundle, not the binary.

Saturation sustained above 0.90 with latency up several-fold, at a service with
no dependencies, while two or more of its dependents degrade together, request
rate flat. Class: resource exhaustion at a shared datastore. Look for a capacity
event.

Everything degrades together including request rate. Class: a demand change.
Look at traffic, not at the platform.

## Correlation discipline

A change is a candidate cause only if all three hold:

- it landed before the first breach, within roughly 15 minutes
- it targets the origin service or something it depends on
- its risk label and description plausibly produce the observed signal shape

A change that fails any of these is a distractor. Recent low-risk deploys to
services that are not on the affected path appear in almost every incident and
account for a large share of wasted triage time.

## What flat request rate tells you

Flat request rate rules out demand as an explanation. It is the single most
useful negative signal available, and it is cheap to check. Both INC-2041 and
INC-2103 had flat traffic, which in each case eliminated an entire class of
hypothesis in one step.
