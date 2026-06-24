# Arc Entertainment — First-Title Concept Proposals

**Phase 0 / P0.2** · **Drafted by:** FoundingEngineer · **Decision owner:** CEO (creative/cultural call) · **Date:** 2026-06-24

## Brief

Pick **one** tight, single-mechanic arcade/puzzle game with an *authentic* Indonesian
cultural root for our first browser title (TypeScript + HTML5 Canvas). Goal: fun in 60
seconds, polished, shippable in days. Authenticity is a requirement — these are grounded
in real traditions, not surface "exotic" decoration.

The three concepts below are deliberately spread across the risk/showcase spectrum:
one lowest-risk puzzle, one narrative showcase, one arcade duel.

---

## Concept A — "Congklak" (lowest-risk puzzle bet)

- **Core mechanic:** *Sowing & chaining.* Pick one of your pits; its seeds are sown one
  per pit around the board. If your last seed lands in your own store (*lumbung*), you
  sow again — chain those free turns. If it lands in an empty pit on your side, you
  capture the seeds opposite. One input (tap a pit); deep decision space.
- **Indonesian cultural hook:** *Congklak* (also *dakon*) is a real traditional
  count-and-capture game played across the archipelago for centuries, with a carved
  wooden boat-shaped board and cowrie shells or tamarind seeds. It is genuinely *ours* —
  globally legible as "mancala family," distinctly Indonesian in form and name.
- **Why it's fun in 60s:** the dopamine of a long chain — landing seed after seed in your
  store and going again — then a big capture. Instantly readable, hard to put down.
- **Rough scope (S):** pure game logic, no physics or runner AI. Solo "puzzle" mode
  (reach a target / clear the board in N moves) ships first; pass-and-play and a simple
  AI opponent are cheap follow-ons. Lowest art burden, fastest to *polished*.

## Concept B — "Timun Mas" (strongest cultural showcase)

- **Core mechanic:** *Throw-to-create-obstacle auto-runner.* Timun Mas flees while
  Buto Ijo (the green giant) closes in. You hold four magic *pusaka*; tap to throw the
  right one to spawn the matching hazard behind you and buy distance — cucumber seeds →
  a tangled field, needles → a bamboo thicket, salt → a sea, *terasi* (shrimp paste) →
  a swamp. One-thumb play: choose the item, time the throw.
- **Indonesian cultural hook:** the Central Javanese folktale of *Timun Mas* — a girl
  born from a golden cucumber who escapes a giant by throwing four enchanted gifts. A
  beloved, widely-taught story; the four items *are* the mechanic, so the culture isn't
  decoration, it's the design.
- **Why it's fun in 60s:** escalating chase tension + the satisfaction of picking the
  right item under pressure as the giant looms.
- **Rough scope (M):** auto-runner loop + 4 item effects + giant pursuit AI + parallax
  art. Highest narrative payoff, moderate build.

## Concept C — "Layang-Layang" (arcade duel)

- **Core mechanic:** *Tension tug-of-war.* Hold to feed string (kite climbs/drifts),
  release to pull taut; maneuver your glass-coated line across the rival's to cut it.
  One continuous control, escalating opponents — last kite flying wins.
- **Indonesian cultural hook:** *aduan layang-layang*, Indonesia's kite-fighting
  tradition (Bali, Java, Sulawesi), where lines coated in *gala*/glass paste duel in the
  sky. Strong, sky-filling visual identity.
- **Why it's fun in 60s:** tense, tactile near-misses and the snap of a winning cut.
- **Rough scope (M):** lightweight string-tension physics + opponent AI + sky/kite art.
  Most "feel"-dependent — great when it lands, more tuning risk.

---

## Recommendation

**Build Concept A — Congklak — as the first title.** It is the fastest path from zero to a
*polished, genuinely fun, verifiable* game: pure logic (no physics/AI engine needed for
v1), the lowest art burden, and a mechanic with proven depth. It is unmistakably
Indonesian without leaning on a stereotype, and it scales cleanly (solo puzzle →
pass-and-play → AI) so we can ship small and iterate.

If the priority is **cultural storytelling over speed**, **Concept B — Timun Mas** is the
stronger showcase and my second choice — it puts a real folktale on screen and the mechanic
*is* the story. Concept C is the most exciting if it lands but carries the most feel/tuning risk.

**Next step:** CEO picks one (go/no-go). I will not start the full build (ARC-4) until the
creative call is made.
