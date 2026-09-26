# UbaisAd.github.io

Personal portfolio of **Ubais Ahamed**, QA Automation Engineer / Software Tester,
built as an interactive 3D robotic QA laboratory. A six-axis robotic arm picks up
physical cardboard parcels; each parcel opens one section of the portfolio.

Live URL once deployed: <https://ubaisad.github.io>

---

## Deploying

1. Create a repository named exactly `UbaisAd.github.io` under your GitHub account.
2. Copy `index.html`, `app.js` and `portfolio-data.js` into the repository root.
3. Commit and push to the `main` branch.
4. In the repository, open **Settings → Pages**, set *Source* to **Deploy from a branch**,
   branch `main`, folder `/ (root)`, and save.

That is the whole deployment. There is no build step, no backend, no database, no
paid asset and no API key. Three.js is loaded from a pinned CDN build; the robot,
the parcels, the lab and every label texture are generated procedurally in the browser.

To preview locally, run any static server from the project folder, for example:

```bash
python3 -m http.server 8080
```

then open <http://localhost:8080>.

---

## Editing the content

All portfolio copy lives in **`portfolio-data.js`** and nowhere else. The 2D sections,
the fallback document and the parcel labels are all generated from it, so editing one
value updates every place it appears.

| What you want to change | Where |
| --- | --- |
| Name, role, location, about paragraphs, links | `PROFILE` |
| Degrees and results | `EDUCATION` |
| Courses | `CERTIFICATIONS` |
| Annular Technologies, Quantem, AI Testing Studio | `EXPERIENCE` |
| Skill groups | `SKILLS` |
| Personal projects | `PROJECTS` |
| The eight-stage testing workflow and its demo data | `QA_WORKFLOW` |
| The sample defect report | `BUG_DEMO` |
| The sample Playwright output | `TERMINAL` |
| LeetCode headline and Easy/Medium/Hard split | `LEETCODE` |
| Contact heading and the two placeholder buttons | `CONTACT` |

The LeetCode Easy/Medium/Hard values are deliberately configurable rather than baked
in, since they change. Set `showBreakdown: false` to show only the headline figure.

Two buttons in Contact are inactive placeholders by design: no email address and no
résumé file have been published. Replace them in `CONTACT` when you have both.

---

## How the robot works

The pickup is a real physical interaction, not a visual trick. The selected parcel is
re-parented onto `ParcelAnchor` inside the gripper with its world transform preserved,
carried through the whole sequence, then re-parented back to the staging group and
restored to its exact original position, rotation and scale.

```
IDLE → TARGETING → APPROACHING → GRIPPING → ATTACHING → LIFTING
     → TRANSITIONING → CONTENT → RETURNING → RELEASING → IDLE
```

The arm is driven by a two-link analytic IK solver. The pointer is projected into the
robot's workspace, clamped to a reachable annulus, and the solver produces joint
angles that are damped frame-rate-independently and speed-limited, so the motion
accelerates and settles like a machine rather than snapping.

### File layout

| File | Responsibility |
| --- | --- |
| `index.html` | Document, metadata, design tokens, all styling, loading screen, HUD, no-WebGL document |
| `portfolio-data.js` | Every piece of portfolio content |
| `app.js` | `LabState`, `Content`, `UI`, `RobotModel`, `RobotController`, `Parcel`, `CameraRig`, `Lab` |

### Replacing the procedural robot with a GLB model

`RobotController` never touches geometry. It only calls `model.applyJoints({j1..j6})`
and `model.setGrip(value)`, and reads `model.anchor`. To swap in a downloaded robot,
write a loader class that exposes the same four things — `root`, `joints.j1`–`joints.j6`,
`setGrip()`, `applyJoints()` and an `anchor` object placed `CFG.robot.toolOffset` below
the wrist — then pass it to `new RobotController(...)`. Update `CFG.robot.l1`, `l2`,
`shoulderY` and `toolOffset` to the model's real dimensions. Nothing in the state
machine, navigation or content layer changes.

---

## Accessibility and fallbacks

- The 3D scene is never the only way in. The **Direct access** panel lists all six
  sections as real buttons; keyboard selection runs the same robot sequence.
- Focus moves to the section heading when a parcel opens, and returns to the button
  that triggered it on leave. `Escape` leaves a section.
- The QA Lab workflow is a proper tablist with arrow-key navigation.
- `prefers-reduced-motion: reduce` collapses the animation timings, stops the idle
  sweep and the terminal typing, and makes camera moves instant.
- If WebGL is unavailable or the scene throws during setup, the whole portfolio
  renders as a plain, readable document instead.

## Content accuracy

Nothing in this site is invented. Quantem and AI Testing Studio are presented as
professional products under Experience and never as personal projects, described at a
level that exposes no internal URL, credential, screenshot, defect ID or tracker
reference. The defect report, workflow examples and Playwright output are labelled as
demonstration data. No time-saving percentage, repository URL, email address or
résumé link is claimed anywhere.
