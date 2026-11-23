"""Score for the Twin-Turret Pollinator film: a light bed (Fmaj9 colours, 100 bpm) at one level, a soft puff on every
shot, a hollow knock where each ball lands in the CELL, the HIVE's tip as a low thud and a rattle as the CELL spills,
a short whirr under each intake pick and a quiet click on every button the operator presses.

    python .claude/skills/teardown/run_sfx.py teardown/pollinator-shared/score.py

Every time comes from ../pollinator-film/timeline.json, which timeline.mjs writes from the routine.
"""

import os

from sfx.score_kit import bed, chords, hz, motor, puff, rattle, thud
from sfx.synth import click

TIMELINE = "../pollinator-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "pollinator-score.wav")
TARGET_LUFS = -14.0
SEED = 26

CHORDS = chords("Fmaj9:F2 C3 E3 G3 A3/F1", "Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb1 F2 A2 D3/Bb0", "C6sus:C2 F2 G2 A2 D3/C1")
MOTIF = [(0.5, hz("A5")), (1.5, hz("C6")), (2.5, hz("G5"))]


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 100, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3600)
    mix.put_stereo(0, left, right, 0.11)
    mix.put(0, low, 0.11)
    mix.put(0, drums, 0.04)
    for t in tl["shots"]:
        mix.put(t, puff(0.9), 0.05)
    for t in tl["places"]:
        mix.put(t, puff(0.5), 0.035)
    for t in tl["lands"]:
        mix.put(t + 0.05, thud(260, 0.05, 0.25), 0.05)
    tip = tl["tip"]
    mix.put(tip + 0.3, thud(70, 0.12, 0.6), 0.1)
    mix.put(tip + 0.4, rattle(0.9, 16, 2600, seed=3), 0.03)
    for t in tl["picks"]:
        mix.put(t - 0.5, motor(1.1, 150, 900, 10), 0.016)
    for t in tl["clicks"]:
        mix.put(t, click(2400, 0.025), 0.05)
