# Twin-Turret Pollinator: an interactive teardown

An interactive 3D simulator of a concept robot for the 2026-27 FTC game **BIOBUZZ**. Open the page and the robot
plays a short match routine. Any click, drag, wheel turn or key hands you the controls.

The robot has two self-aiming turrets, one for POLLEN (71 mm) and one for NECTAR (91 mm). They can never hit each
other. Both shoot a backspin arc into the upward-facing CELL while the robot drives. A front and a rear intake pull
POLLEN out through a FLOWER's bottom retrieval opening, and the turrets lob POLLEN or NECTAR in through the FLOWER's
4 in. top. A passive size sorter sends each ball to its turret, and a servo lift in each tower carries it up.

The body is laser-cut, slot and tab: 6 mm birch plywood for the first iteration, 3 mm 5052 aluminium once it is
tuned. The cut files in `cut/` come from the same model as the 3D view, so the two can't disagree. Every gauge on the
console reads the same functions that move the parts.

Built with the `teardown` skill in `.claude/skills/teardown`.

## Cut the body

`cut/ply/` and `cut/alu/` each hold the whole body (`cut/ply/preview.png` shows the plywood sheets):

- `sheet-1` … `sheet-4`: every part nested on a 610 × 610 mm bed, as SVG and DXF.
- `parts/`: each part on its own.
- `parts.csv`: the part list with sizes.
- `fit-comb`: a comb with slots from t − 0.1 to t + 0.4 mm, and a matching tab.

In the SVGs, red is cut and blue is engrave (the part name). In the DXFs, the layers are `CUT` and `ENGRAVE`. All
units are millimetres.

1. **Cut the fit comb first** and find the slot your sheet and laser press-fit into. Plywood is rarely exactly 6 mm.
2. **Set `clear` to match.** It's in `MATERIALS` in `pollinator-shared/plates.js`.
3. **Regenerate:** `node teardown/pollinator-shared/cutfiles.mjs` (add `--sheet 600x400` for another bed size).
4. **Check your hardware against `HOLES`** in the same file. The axle-bearing and hub-standoff sizes are placeholders,
   so measure the parts you have.

The deck and the belly are 457 mm square, so they need a bed at least that big, or a cutting service.

The joints are designed so the plates can't move. Every slot is cut from the 3D footprint of the tab that goes
through it. A check confirms that all 106 tabs land in solid material, with no slot in a hole and no web under 3 mm.
That check passes for both materials.

## Build and open

```
cd .claude/skills/teardown && npm install && cd -          # once
node teardown/pollinator-shared/timeline.mjs                # timeline.json from the routine (for the score)
TEARDOWN_OUT=teardown/out node .claude/skills/teardown/sims/build.mjs ./teardown/pollinator-live
TEARDOWN_OUT=teardown/out node .claude/skills/teardown/sims/build.mjs ./teardown/pollinator-film
```

Open `teardown/out/dist/pollinator-live.html`. It is one offline file of about 850 KB. Add `?q=low` on a slow laptop.

**Controls:** ROUTINE jumps to a chapter. The timeline scrubs, and SPEED sets the pace. Drag the 3D view to orbit and
use the wheel to zoom.

**Keys:** `1`-`7` views, `space` play/pause, `←`/`→` seek, `x` x-ray, `a` arcs, `e` envelopes, `l` labels, `p` parts,
`m` plywood/aluminium.

To render the film to video, use `.claude/skills/teardown/sims/capture.mjs pollinator-film`. It needs ffmpeg and a
GPU, because a software renderer takes seconds per frame. The procedural score is `pollinator-shared/score.py`.

## Files

| File | Job |
|---|---|
| `pollinator-shared/robot.js` | The math. The game dimensions from the manual, the robot's design numbers, flight with drag and backspin lift, the drive-by aim solver, mecanum kinematics and Limelight visibility. No three.js. |
| `pollinator-shared/routine.js` | The match routine as one clock. It covers the path, every shot (solved at load with the solver above), every ball's story, the HIVE tip, the localization error, and the turret modes. |
| `pollinator-shared/paths.js` | The body layout in millimetres (ramp, sorter and tower heights) and every path a ball takes inside the robot. Shared by the plates, the geometry and the routine. |
| `pollinator-shared/plates.js` | The laser-cut body: 25 plates as 2D outlines with tabs, placed in 3D, with slots cut from the tabs' footprints. Plywood or aluminium. |
| `pollinator-shared/cutfiles.mjs` | Writes `cut/`: SVG and DXF per part, nested sheets, a fit comb, a part list. |
| `pollinator-shared/build.js` | The robot geometry, built from code out of REV parts, printed parts and the two required sensors. |
| `pollinator-shared/field.js` | The field: tiles, perimeter, the HIVE with its rocking CELLs, FLOWERs, POLLEN and NECTAR. |
| `pollinator-shared/stage.js`, `console.js` | The renderer, and the 1600 × 900 console overlay. |
| `pollinator-shared/film.js`, `live.js` | The recorded tour, and the page you drive. |

## How it works

**Self-aiming.** A goBILDA Pinpoint dead-reckons the pose from two goBILDA odometry pods. The Limelight 3A is pitched
32° up so it can see the AprilTag cluster on the underside of the CELL (§9.9). Whenever it sees those tags, a MegaTag
fix pulls the fused pose back. When it doesn't, for example while reversing away from the HIVE, the console shows the
error growing.

Each turret's yaw, hood angle and flywheel speed come from `solveShot`. It runs a Newton solve on the miss at the CELL
rim, using the robot's velocity and turn rate. Drive-by lead therefore comes out of the same solve as the range, and
at 0.7 m/s strafe it is about 15-18°. The flight model includes quadratic drag on a holed ball and Magnus lift from
the backspin.

**Backspin.** Each turret has two 64 mm flywheels, one above the ball and one below. The bottom wheel is on the
motor. The top wheel is driven through a 40T:47T printed gear pair, so it counter-rotates 15 % slower. That gives the
ball about 100 rpm of backspin at a 4.7 m/s exit speed. The hood pitches the whole flywheel pod between 42° and 62°.

**No turret collisions, ever.** Each turret's plan-view swept radius is computed from its parts (`podSweep`): the
flywheels at their worst hood angle, the pocketed cheek discs, and the motor behind. The results are 101.6 mm
(POLLEN) and 105.7 mm (NECTAR). The turret centres are 224 mm apart, so there is a 16.7 mm gap at any pair of
angles, and neither turret needs a keep-out zone. Both stay inside the 18 in. frame, with 9 mm to spare on the NECTAR
side.

**Sorting, by size.** The sorter is a channel across the middle of the robot. Its two walls stand 80 mm apart, and
both ramps end at it.
- **POLLEN (71 mm)** drops between the walls. The channel floor falls 4 mm toward the pollen tower, and the ball rolls
  there.
- **NECTAR (91 mm)** can't fit. It sinks 24 mm between the wall tops and rides them like rails, which fall 4 mm the
  other way, into the nectar tower.

There's no diverter and no decision to make, so the diverter servo is gone. NECTAR clears the channel floor by 2.5 mm
or more all the way. A REV Color Sensor V3 under each ramp's top counts the balls and catches a red NECTAR, which
reverses the intake (G408: no controlling opponent NECTAR).

**Transfer.** Each tower is a square tube on its turret's axis: 80 mm for POLLEN, 100 mm for NECTAR. Three TPU
compliant wheels on one belt sit behind the tower's rear wall and reach 10 mm in through a window. One continuous
Smart Robot Servo drives them.
- **The lane holds 2:** one ball waits at the top of the lift, stalled under the deck with its top already in the
  bore. The next waits at the foot.
- **Firing:** the lift throws the top ball up through the bore and the turret ring, into the turret's feeder.

**FLOWER work.** The intake roller's TPU flaps reach 42 mm from a 50 mm-high axle. The whole roller therefore fits the
3.55 in. retrieval opening, so POLLEN comes out of the bottom only (G418.B). Placing goes in through the top only
(G418.A): the turret switches to a lob at 2.5 m/s and 62°. NECTAR goes last so that it is the top-most NECTAR, which
owns the FLOWER.

## Bill of materials

| Source | Parts |
|---|---|
| **Laser-cut** (6 mm birch ply, then 3 mm 5052 aluminium) | 2 side plates, deck, belly pan, 4 bulkhead legs, 4 ramp walls + 2 ramp floors, 2 sorter walls (their tops are the NECTAR rails, and they are the pollen tower's sides) + the channel floor, the pollen tower's outer wall, 3 nectar tower walls, 4 drive-motor plates. 25 plates, slot and tab. |
| **REV Robotics** | 8 × HD Hex Motor with UltraPlanetary: 4 drive (4:1 + 3:1 → 1.96 m/s free), 2 flywheel (3:1), 2 intake (each also drives the lift roller over its lip). 8 × Smart Robot Servo: 2 turret yaw (continuous), 2 hood, 2 turret feeder (continuous), 2 tower lift (continuous). 4 × 75 mm Mecanum Wheel. Control Hub + Expansion Hub. 2 × Through Bore Encoder (turret angle, geared to the ring on the deck). 2 × Color Sensor V3 (ball count, red-NECTAR reject). 5 mm hex shafts, bearings, fasteners. Slim Battery, strapped on the deck. |
| **3D-printed** (PETG-CF; TPU where noted) | 2 × 60T m2 turret ring gears on printed ball-bearing races, 4 × 30T gears (pinions and encoder gears). 4 × pocketed cheek discs, 4 × pod plates. 4 × 64 mm flywheel hubs with TPU tyres, 2 × 40T/47T gear pairs. 2 intake lips, intake arms, roller hubs, TPU flaps. 6 TPU lift wheels and 2 lift brackets. Limelight mast. Turret spacers for the 3 mm aluminium deck. |
| **Other COTS** | Limelight 3A (the only vision coprocessor R702 allows). goBILDA Pinpoint + 2 goBILDA odometry pods. 6 mm BBs for the printed turret bearings. An HTD belt for the flywheel step-up. |

The robot uses **8/8 motors and 8/8 servos** (R503). It starts within 18 × 18 × 18 in. (R102). Both intakes swing 3 in.
out at the start: 18 + 2 × 3 = 24 in., which is exactly the R105 length. It never holds more than 4 elements (G407).

## What is modelled and what is assumed

- **From the manual (§9):** ball sizes, CELL opening (20 × 14 × 12 in.), HIVE pivot height (43.95 in.), CELL
  spacing, FLOWER top opening (4 in. at 21.5 in.), retrieval opening (3.55 in.), field size and tiles, AprilTag
  placement and IDs, and the robot limits.
- **Assumed:**
  - Ball masses (30 g POLLEN, 50 g NECTAR), because the manual gives none.
  - The HIVE rocker geometry (±25° stable states), and that a CELL tips at 6 elements.
  - Where the FLOWERs and HIVE sit on the field.
  - The drag and lift coefficients.

  Check these against the real field elements before trusting any number to the millimetre.
- The robot is a concept, not a CAD model: the parts are dimensioned to work together, not detailed for printing.
