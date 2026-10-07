<!--
Thank you. Delete whichever section does not apply.

If this is a typo fix, just say so and delete everything else.
-->

## What this changes

<!-- One or two sentences. -->

---

## For a content change

- [ ] `npm run content:validate` passes
- [ ] Every code example was run, and produces the output the lesson claims
- [ ] Any benchmark shown was actually measured, not estimated
- [ ] The writing is original — not copied or closely paraphrased from a course, book or
      other site. Primary documentation is linked rather than reproduced.
- [ ] `concepts:` is filled in (it drives the review queue, the concept map and gap analysis)
- [ ] `last_reviewed` is today's date

**The bar** (from [CONTENT_GUIDE.md §10](../blob/main/CONTENT_GUIDE.md#10-the-bar)):

- [ ] It starts from the problem, not a definition
- [ ] A beginner could follow it — no unexplained jargon
- [ ] An experienced reader would still learn something
- [ ] It says what this costs, not only what it buys
- [ ] It says what happens when it breaks

---

## For a code change

- [ ] `npm test` passes
- [ ] `npm run lint` passes (including the architecture layering rules)
- [ ] `npx tsc -b` passes
- [ ] `npm run build` passes, including the initial-payload budget
- [ ] New logic has tests that describe behaviour, not implementation
- [ ] If a learner interacts with it, there is a check in `scripts/smoke.mjs`

Against the
[non-negotiable constraints](../blob/main/CONTRIBUTING.md#constraints-that-are-not-negotiable-without-a-discussion):

- [ ] Still works with no server
- [ ] Core experience still works with no AI/paid API
- [ ] Contributors still add content without touching TypeScript
- [ ] No "coming soon" — the feature works or is absent
- [ ] Initial payload still under budget (anything large is lazy)
- [ ] No analytics, no third-party runtime requests
