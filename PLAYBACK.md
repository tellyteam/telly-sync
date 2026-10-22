# How telly plays things

Every telly app (Fire TV and Android TV, iPad and Mac, LG) behaves exactly as described here. A
change to this behaviour is made here first, with its cases in
[`playback-cases.json`](playback-cases.json), and then in every app in the same piece of work.
Each app's unit tests run the same cases (a copy of the file sits beside them), so an app that
drifts fails its tests.

Times are whole milliseconds.

## The next-episode prompt

While a film or episode plays and something comes after it in the playlist (the rest of a season,
or the next season), a small prompt shows in the bottom-right corner for the **last 60 seconds**,
whatever the length of the episode:

    ▶ Next in 42s · OK
    The next episode's title

- It counts down the real time left, a whole second at a time, rounding up (9.5 s left shows 10).
- It shows only when all of these hold: not live TV; there is a next item; "Play the next episode
  automatically" is on; it hasn't been dismissed for this item; the duration is known; and
  `0 < duration − position ≤ 60 000`.
- **Play now:** OK on a remote, a click or a tap on the prompt. The next item starts and this one
  counts as watched.
- **Dismiss:** Back on a remote, or the prompt's ✕. It stays hidden for the rest of this item, and
  autoplay doesn't happen at its end.
- Pausing doesn't hide it; it waits with the video.

The prompt stays out of the way: about 220 points wide, two short lines, never over the playback
controls (it hides while they're showing).

## Autoplay

When a film or episode plays to its end, it counts as watched. Then, if there's a next item,
autoplay is on and the prompt wasn't dismissed, the next item starts straight away, at its saved
position if it has one (see Resuming). Otherwise the player stays on the last frame with its
controls showing.

"Play the next episode automatically" is a setting on every app, on by default.

## Watched

A film or episode counts as watched once it's within its credits: `duration − position <
max(60 000, duration / 20)`, the last minute or the last 5%, whichever is longer. (Long episodes
often run two or three minutes of credits.) A watched item shows ✓ rather than a progress bar.

## Resuming

- An item starts from its saved position, unless it was barely started (`position < 15 000`) or is
  watched; then it starts from the beginning.
- "Pick up where you left off" on an episode left watched starts the next episode instead, if there
  is one.

## Continue watching

- One entry per series, per film and for live TV, newest first.
- An entry leaves the row once there's nothing left in it: a watched film, or a series whose last
  known episode is watched.
- A series that left the row comes back when the provider adds episodes after the last one watched,
  at the next episode. If they arrived after it was watched, it's marked "New episodes" (and says
  so once). A series is only fetched again when the provider has changed it, or once a day for
  providers that don't say.

## Downloads

A downloaded episode plays as part of its season, exactly as when streaming: the prompt, autoplay,
watched and resuming all work the same way.

- Each item plays from its download when there is one, and streams otherwise.
- With no connection, the next item is the next one that's downloaded (skipping those that aren't).
  If none is, the player stops at the end with its controls and says the next episode isn't
  downloaded.
- A downloaded film plays on its own, as a streamed film does.
