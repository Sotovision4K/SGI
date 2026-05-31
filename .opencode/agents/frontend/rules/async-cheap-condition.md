Impact: HIGH (avoids unnecessary async work when a synchronous guard already fails)

When a branch uses await for a flag or remote value and also requires a cheap synchronous condition (local props, request metadata, already-loaded state), evaluate the cheap condition first. Otherwise you pay for the async call even when the compound condition can never be true.

This is a specialization of Defer Await Until Needed for flag && cheapCondition style checks.

Incorrect:

const someFlag = await getFlag()

if (someFlag && someCondition) {
  // ...
}

Correct:

if (someCondition) {
  const someFlag = await getFlag()
  if (someFlag) {
    // ...
  }
}

This matters when getFlag hits the network, a feature-flag service, or React.cache / DB work: skipping it when someCondition is false removes that cost on the cold path.

Keep the original order if someCondition is expensive, depends on the flag, or you must run side effects in a fixed order.