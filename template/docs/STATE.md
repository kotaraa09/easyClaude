<!-- easyclaude:not-kicked-off -->
<!-- The line above is what tells the SessionStart hook that this project is still the
     untouched template, so kickoff runs on its own the first time - which is what
     template/README.md promises. Without it the hook only sees that docs/STATE.md exists,
     takes that as "already set up", and reads this empty file back to someone who was
     told setup would happen by itself. kickoff rewrites this file without the marker,
     which is what clears it. Do not delete it by hand. -->

# State
<!-- Every session opens by reading Now, Next, Blocked and Debt back to the user. Write
     entries in the language the user writes in, and in their words: what they will see
     or be able to do. File names and technical terms go after a dash, if at all. -->

The handover file between sessions. Claude reads this first and updates it as work lands.

## Now
(nothing in progress — run kickoff)

## Next

## Blocked
none

## Debt
<!-- Deliberately skipped work, specific enough to act on later. Read back at plan
     time: anything here touching the area being planned becomes a candidate task.
     Debt nobody re-reads is a slower way of forgetting. -->

## Done
<!-- The ten most recent. Older entries move to docs/CHANGELOG.md, newest first -
     never deleted, just moved. This file is read at the start of every session, so
     it cannot be allowed to grow without bound. -->
