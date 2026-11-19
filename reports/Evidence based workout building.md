# Let weekly volume, not caps, build sessions

Forge should build a session in this order. Start from a weekly set target for each muscle. Divide it by how many times that muscle is trained per week. Fill the resulting per-session budget with high-quality exercises up to an evidence-based ceiling of about **11 fractional sets per muscle per session**, and only then let the time target decide whether to add new muscles or stop early. Fractional means a direct set counts 1.0 and a synergist set counts 0.5. Hypertrophy keeps rising with weekly volume along a square-root curve with no hard plateau up to roughly 30 fractional sets ([Pelland 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2025/12/The-Resistance-Training-Dose-Response.pdf)), while per-session returns stop being detectable at about 11 fractional sets for size and about 2 direct heavy sets for strength ([Remmert 2025 preprint](https://sportrxiv.org/index.php/server/preprint/view/537)). The current generator's 6–8 set cap therefore sits below the evidence, and if it counts synergists at full weight it bites even earlier. That explains why a 120-minute push day stops at 4 exercises and 37 minutes. Its second failure, exercise quality, has a clear evidence-based fix. Score exercises on four things: loading the muscle at long lengths, stability, ease of progression, and systemic fatigue. Then make tiers goal-specific, so a pause squat or sumo deadlift can be a legitimate powerlifting lift and still a poor hypertrophy default. Reps (6–30 all grow muscle near failure; heavy loads win for strength), proximity to failure (1–3 reps in reserve on compounds), rest (more than 60–90 s for hypertrophy, 3+ min for strength), supersets (about half the time at equal outcomes), and progression (double progression, RIR autoregulation, a reduced-volume deload every 4–8 weeks) all have workable evidence. Exact cut-points within those ranges are design choices, flagged below. Most of the new evidence confirms the earlier PPL/UL program. It also shows that program's per-session volume was conservative and that one or two of its exercise justifications (cable over dumbbell laterals, the size of the seated-curl advantage) were overstated.

Confidence labels used throughout: **High** (several meta-analyses agree), **Moderate** (one large meta-regression or a few good trials), **Low** (single small trial, preprint, EMG, or practitioner consensus), and **Design** (an engineering choice inside an evidence-supported range, with no trial behind the exact number).

## Hypertrophy rewards about 10–20 weekly sets, delivered in sessions of 11 or fewer

The anchor for volume is now the peer-reviewed Pelland et al. meta-regression: 67 studies, 2,058 participants, interventions averaging 10.4 weeks. It found the best-fitting hypertrophy model was a **square root**, with a 100% posterior probability of a positive slope and **+0.24% muscle size per extra weekly fractional set** at the sample mean of 12 sets. The authors explicitly describe diminishing returns "but not an inverted-U" ([Pelland 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2025/12/The-Resistance-Training-Dose-Response.pdf)). Their efficiency tiers turn that curve into something an algorithm can use. **4 fractional sets/week is the minimum effective dose.** 5–10 sets is the most efficient zone, needing about 6 extra sets per detectable increment of growth. 11–18 needs about 8.5 extra sets per increment, and 19–29 about 10.75. Above about 25 sets the data are thin, and above 43 they are absent (Moderate). Strength behaves differently. Its curve is reciprocal, with a functional plateau around **4–5 fractional weekly sets on the tested lift**, past which extra sets "do not consistently enhance strength gains" beyond the smallest detectable effect (Moderate). Older categorical analyses agree on direction. Groups doing at least 9 sets did better than those doing fewer (ES 0.46 vs 0.32), and Baz-Valle found no quad or biceps difference between 12–20 and more than 20 weekly sets, calling 12–20 "an optimum standard recommendation" for young trained men ([Baz-Valle 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877)). The 2026 ACSM position stand, an overview of 137 systematic reviews, lands on about **10 sets per muscle per week** for hypertrophy and training every major muscle **at least twice weekly** ([Medical News Today on ACSM 2026](https://www.medicalnewstoday.com/amp/articles/new-resistance-training-guidelines-debunk-myths-stronger-muscles-strength-size)).

How sets are counted matters as much as how many. Pelland compared three counting methods and found that counting a synergist set as **half a set** beat both "count everything" and "count only direct sets" by Bayes factor. The stimulus from an indirect set is "close to half" that of a direct set, though the authors call 0.5 a heuristic "rather than a definitive standard" ([Pelland 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2025/12/The-Resistance-Training-Dose-Response.pdf)) (Moderate). For example, 5 sets of rows plus 5 of curls is 7.5 fractional biceps sets. A practitioner worked example shows full counting overstating chest-day volume by about 25% (14.0 vs 10.5) ([Root Strength](https://www.rootstrengthseattle.com/blog/training-volume-dose-response)). That inflation is one reason a per-muscle cap fires too early: four bench and incline sets would "fill" the triceps before any triceps exercise is chosen.

The per-session ceiling comes from Remmert, Pelland, Robinson, Hinson and Zourdos, a preprint I could check only through its abstract and the university press release. Both outcomes had a 100% probability of a positive per-session slope. The "point of undetectable outcome superiority" was about **11 fractional sets per muscle per session for hypertrophy** and about **2 direct sets per session for strength** ([EurekAlert/FAU](https://www.eurekalert.org/news-releases/1086804)). Senior author Zourdos describes the region past this as "a tipping point where the benefit of doing more becomes very questionable." That is a statement about undetectable gains, not harm (Low–Moderate). For the generator this means a soft cap of 10–12 fractional sets per muscle per session for intermediate and advanced hypertrophy users, about 8 for beginners, and a hard ceiling around 14. The hard ceiling marks where the data run out, not where damage begins (Design, within the Remmert range).

Frequency's job is to fit weekly volume under that ceiling. With volume equated, extra sessions added only **+0.32% per session for hypertrophy** (95% CrI −0.14 to 0.82), which the authors call "compatible with negligible effects". For strength they added a real **+3.27% per session**, with the largest jump from one to two sessions per week (12.7% → 17.3%) ([Pelland 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2025/12/The-Resistance-Training-Dose-Response.pdf)) (Moderate–High). The resulting rule is **frequency = max(2, ceil(weekly target ÷ per-session cap))** per muscle for hypertrophy, and 2–3 exposures per week per competition lift for strength. Training level barely moved the volume slope in Pelland's moderator analyses, which the authors treat as hypothesis-generating. So the level splits below are practitioner convention anchored to the tiers (RP's maintenance of about 6/week, and Root Strength's 6–10 / 10–16 / 16+ ladder) ([RP Strength](https://rpstrength.com/training-volume-landmarks-muscle-growth/); [Root Strength](https://www.rootstrengthseattle.com/blog/training-volume-dose-response)). The research did not find dose data for training in a calorie deficit, so the get-lean and weight-loss volumes are moderate maintenance-plus defaults. They are not evidence-derived.

| Goal | Level | Weekly fractional sets / muscle (default) | Per-session min / soft max (hard) | Exercises per muscle per session | Frequency per muscle |
|---|---|---|---|---|---|
| Build muscle | Beginner | 8–12 (10) | 2 / 8 (10) | 1–2 | 2–3× |
| | Intermediate | 12–18 (15) | 3 / 11 (14) | 1–3 | 2× |
| | Advanced | 16–24 (20); priority muscles up to ~30 | 3 / 12 (14) | 2–3 | 2–3× |
| Get stronger | Beginner | Main lifts 4–8 direct; muscles 8–10 | Main lift 2–3 heavy sets; 8 total | 1–2 | 2–3× per lift |
| | Intermediate | Main lifts 6–10; muscles 10–14 | Main lift 2–5 heavy sets; 10 total | 1–2 | 2–3× per lift |
| | Advanced | Main lifts 6–12; muscles 10–16 | Main lift 3–6 heavy sets; 11 total | 2 | 2–4× per lift |
| Powerlifting | All | Squat/bench/deadlift 4–12 each (bench high, deadlift low); accessories 6–12 per muscle | 2–5 heavy competition sets + 1–2 variations; 11 per muscle | 1–2 | Squat, bench 2–3×; deadlift 1–2× |
| Get lean / weight loss | Beginner | 6–10 (8) | 2 / 6 | 1–2 | 2× |
| | Intermediate | 8–14 (12) | 2 / 9 | 1–2 | 2× |
| | Advanced | 10–16 (14) | 3 / 10 | 1–2 | 2× |
| General fitness | Beginner | 4–8 (6) | 2 / 6 | 1 | 2× |
| | Intermediate | 6–12 (9) | 2 / 8 | 1–2 | 2× |
| | Advanced | 8–14 (10) | 2 / 10 | 1–2 | 2× |

The ranges are Moderate, anchored to Pelland's tiers, Baz-Valle, Remmert and ACSM. The defaults are Design. The general-fitness floor follows Iversen's time-efficient minimum of **at least 4 weekly sets per muscle in the 6–15RM range** ([Iversen 2021](https://pubmed.ncbi.nlm.nih.gov/34125411/)).

## A push day saturates near 26 sets, so 120 minutes needs new muscles, not more sets

No study compares 30-, 60- and 120-minute sessions at equal weekly volume, so session length has to be modelled. It should not be treated as a target to hit. Two pieces of evidence set the time constants. Repetition durations from 0.5 to 8 s produce similar hypertrophy ([Schoenfeld 2015](https://pubmed.ncbi.nlm.nih.gov/25601394/)), so a working set takes about **reps × 3 s + 10 s of setup**. Rest needs to exceed 60 s for hypertrophy, with no detectable added benefit past about 90 s in Singer's Bayesian meta-analysis ([Singer 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11349676/)). Strength benefits from 3–5 minutes ([de Salles 2010](https://pubmed.ncbi.nlm.nih.gov/19811949/); [Schoenfeld 2016](https://pubmed.ncbi.nlm.nih.gov/26605807/)). The rest of the model is assumption. It covers warm-up sets of 60–75 s each, transitions of 60 s between adjacent cable or dumbbell stations up to 180 s for a loaded barbell, and a 5-minute general warm-up. Forge should calibrate these against its own logged timestamps.

With those constants, a hypertrophy session averages **about 3 minutes of clock time per working set**, all-in. Compounds with warm-ups and 2–3 min rest run 3.5–4 min per set; isolations with 75 s rest run about 2 min. That gives roughly **8 sets in 30 minutes, 13 in 45, 18 in 60, 23 in 75, 28 in 90 and 36–38 in 120**. This matches the independently derived ranges in the volume notes (8–10, 12–15, 16–20, 20–24, 24–28, 30–36) (Design). Strength and powerlifting sessions fit about 30% fewer sets, because a 5×3 main lift with 4-minute rests and five warm-ups costs about 27 minutes on its own. Antagonist or non-competing supersets add about 30–50% capacity.

The more important number is how much volume a day type can absorb before every muscle trained that day hits its per-session cap. Take an intermediate on a push day with chest capped at 11 fractional sets. Chest takes about 10 direct sets across three exercises (main press 4, incline 3, fly or dip 3). Front delts take about 5 fractional sets from that pressing plus 3 from an overhead press. Side delts take 6–8 direct sets, and triceps take about 6 direct sets plus 6–7 fractional from pressing. That is **roughly 24–28 working sets, 7–8 exercises, and 75–95 minutes**. Working it through the time model, bench 4×6–10 with three warm-ups runs about 16 minutes. Incline dumbbell press, dips and overhead press run about 9 minutes each, a unilateral cable fly about 8, four lateral-raise sets about 8, and two triceps exercises about 6 each. With the general warm-up, the total is about 75 minutes. Past that point the evidence says extra chest or triceps sets add no detectable growth ([EurekAlert/FAU](https://www.eurekalert.org/news-releases/1086804)). The honest way to fill a 120-minute push day is to add muscles that are not otherwise saturated: rear delts, abs, calves or forearms. Otherwise the session should end early with a "session complete" message. Pull days saturate similarly, at about 24–28 sets. Leg days can absorb about 28–32, because quads, hamstrings, glutes, calves and abs are each separate budgets. Full-body and upper days can genuinely use 100–120 minutes.

The current generator stops at about 4 exercises and 37 minutes for three compounding reasons. First, a cap of 6–8 counted on total rather than fractional sets fills the triceps and front delts from pressing alone. Second, its score cutoff kills candidates long before time runs out. Third, it never moves on to the other muscles the day could legitimately train. When time is short (30 minutes or less), the rules flip. Keep at least 2–3 direct sets for each muscle the day is responsible for, pair exercises into antagonist supersets, and drop muscles before dropping below that minimum. Never let a muscle's weekly total fall below the 4-set minimum effective dose ([Pelland 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2025/12/The-Resistance-Training-Dose-Response.pdf)).

## Exercise quality comes from stretch, stability and fatigue cost, scored per goal

The first rule of exercise ranking is to trust longitudinal hypertrophy data (MRI or ultrasound over weeks) over acute EMG. Vigotsky and colleagues showed that surface EMG amplitude "is not a validated predictor of muscle hypertrophy" ([Vigotsky 2022](https://link.springer.com/content/pdf/10.1007/s40279-021-01619-2.pdf)). Plotkin's trial is the concrete case. Hip thrusts produced more glute EMG than squats but no more glute growth, and squats additionally grew quads and adductors ([Plotkin 2023](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1279170/full)) (Moderate). Each exercise rating should therefore carry an evidence level, ordered longitudinal > biomechanical model > EMG > practitioner consensus.

Five attributes carry most of the evidence.

**Long-length loading** is the strongest positive signal, and it is clearest in the triceps, hamstrings, quads and calves:
- Overhead cable triceps extensions grew the long head 28.5% against 19.6% for a neutral-arm extension, and the whole triceps about 1.4× more ([Maeo 2023](https://pubmed.ncbi.nlm.nih.gov/35819335/)).
- Seated leg curls grew whole-hamstring volume about 14% against 9% for lying curls ([Maeo 2021](https://pubmed.ncbi.nlm.nih.gov/33009197/)). That gap is about 5 percentage points, not the "50% more" sometimes quoted.
- A reclined leg extension (about 40° hip angle) grew the rectus femoris more than an upright one ([Larsen 2025, leg extension](https://pubmed.ncbi.nlm.nih.gov/39699974/)).
- Bottom-range calf raises beat both full range and top-range partials ([Kassiano 2023](https://pubmed.ncbi.nlm.nih.gov/37015016/)).

It is not universal, though. Cable and dumbbell lateral raises produced statistically equivalent side-delt growth despite very different resistance curves ([Larsen 2025, lateral raise](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12277279/)). In trained lifters, lengthened partials matched full range for the arms but did not beat it ([Wolf 2025](https://peerj.com/articles/18904)). Long-length loading should therefore be a moderate bonus, one tier step at most, never a trump card (Moderate).

**Stability** is the second attribute. Free weights and machines produce equivalent hypertrophy (SMD −0.055), while strength stays specific to the trained modality ([Haugen 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10426227/)). Machines and cables should never be penalized for hypertrophy, and a strength-transfer bonus should apply only when the goal is strength (Moderate–High).

**Region coverage** is the third. Incline pressing biases the upper pec ([incline vs flat, 2022](https://link.springer.com/article/10.1007/s42978-022-00200-1)). Incline curls grow the proximal biceps while preacher curls grow the distal part ([Kassiano 2025](https://pubmed.ncbi.nlm.nih.gov/39809454/)). Knee extensions grew the rectus femoris 13.2% against 1.1% for leg press, while leg press grew glutes and adductor magnus that knee extensions did not reach ([single- vs multi-joint quads](https://www.fisiologiadelejercicio.com/wp-content/uploads/2026/02/hypertrophic_effects_of_single__versus_multi_joint.1002-1.pdf)). Squats produce essentially no hamstring growth ([Kubo 2019](https://link.springer.com/doi/10.1007/s00421-019-04181-y)) (Moderate).

**Direct isolation** is the fourth. Curls grew the elbow flexors about twice as much as rows (+11.1% vs +5.2%) ([Mannarino 2021](https://paulogentil.com/pdf/Single-Joint%20Exercise%20Results%20in%20Higher%20Hypertrophy%20of%20Elbow%20Flexors%20Than%20Multijoint%20Exercise.pdf)). Hypertrophy templates should therefore schedule direct arm, side-delt and rear-delt work even after fractional credit from compounds (Moderate).

**Systemic fatigue** is the fifth, and it is the least measured. Volume-equated squats, bench and deadlifts recovered on similar 48–72 h time courses ([Belcher 2019](https://csep.ca/2019/06/19/time-course-of-recovery-is-similar-for-the-back-squat-bench-press-and-deadlift-in-well-trained-males-2/)). "Stimulus-to-fatigue ratio" remains an expert construct, not a measurement, and expert consensus pushes failure-close volume toward machines and single-joint work ([Schoenfeld, NSCA 2022](https://www.nsca.com/globalassets/events/pdf/nat22/schoenfeld-brad.pdf)) (Low). Give each exercise a 1–5 fatigue score and cap how many high-fatigue lifts appear per session and per week.

Tiers must be goal-specific. Strength is highly specific to the trained lift: squat training beat leg press for squat 1RM ([squat vs leg press](https://pubmed.ncbi.nlm.nih.gov/27735888/)), and full squats raised 1RM at every depth more than partials did ([Pallarés](https://pubmed.ncbi.nlm.nih.gov/31092132/)). More than 97% of surveyed powerlifters use the competition lifts plus planned variations ([Amdi 2026](https://pubmed.ncbi.nlm.nih.gov/41166696/)). A pause squat is therefore an A-tier powerlifting variation and a C-tier hypertrophy main lift. Barbell bench is S for strength and S/A for chest growth. A conventional or sumo deadlift is S for powerlifting but B or C for hamstring hypertrophy, because its fatigue is high and its load at long hamstring length is modest.

This framework explains every bad pick reported in the current generator:
- **Floor press** cuts off the stretched bottom of the press.
- **Farmer carries** are a grip and conditioning tool with no hypertrophy evidence for any pull-day muscle.
- **Sumo deadlift plus pause squat** for hypertrophy legs pairs two fatigue-4/5, strength-specific lifts and includes no knee extension or leg curl.
- **Supermans** offer tiny load and almost no way to progress.
- **Reverse curls** are a brachioradialis accessory, not a biceps exercise.

### Ranked exercises per muscle, with the home gym marked

The tables combine the longitudinal evidence above with biomechanical reasoning. The tier is the hypertrophy tier unless noted. Attribute shorthand: **LL** = long-length loading, **Stab** = stability, **Prog** = ease of progressive overload, **Fat** = systemic fatigue (1–5). The Home column refers to the user's equipment as recorded in the earlier program research: barbell and plates, EZ bar, dumbbells, an adjustable bench, a power rack, a dip station, and a cable lat-pulldown/low-row station with straight bar, D-handles, rope and V-bar. There is no leg press, leg curl or leg extension, and the earlier program assumed no pull-up bar. In that column, **★** is the best home option for the slot, **✓** is available, **~** is possible with improvisation, and **✗** is unavailable. Only the triceps, biceps, side-delt, incline-chest, hamstring-curl, quad, calf and glute placements rest on training studies. Lats, upper back, rear delts, front delts, forearms, erectors and abs are Low-confidence biomechanical or consensus rankings.

**Chest**

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | Incline DB press, 15–30° | LL high, Stab good, Prog high; upper-pec bias (Moderate) | ★ |
| S (strength S) | Barbell bench press, full ROM | Best strength transfer, Prog high, Fat 3 | ★ (main horizontal press) |
| A | Flat DB press; machine chest press; Smith incline | Equivalent growth to free weights (Haugen) | ✓ DB / ✗ machines |
| A | Weighted dip, forward lean | Deep loaded stretch, lower/mid pec; shoulder stress at depth | ★ (dip station) |
| A | Cable fly / pec deck with deep stretch | Stab high, LL high, low fatigue | ~ single-arm low-to-high cable fly on the low pulley; pec deck ✗ |
| B | DB fly, loaded/deficit push-up, decline press | Fly: zero load at top, shoulder stress if heavy | ✓ |
| C | Floor press, Svend press, landmine press as main lift | Floor press removes the stretched range | ✓ but exclude as primary |

**Lats**

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | Lat pulldown, full overhead stretch | LL high, Stab high, Prog high, skill low | ★ |
| S | Pull-up / chin-up, weighted when able | LL high; bodyweight limits beginners | ✗ unless a bar is added |
| A | Half-kneeling single-arm cable pulldown | Bigger stretch, fiber-aligned path | ★ (D-handle) |
| A | Seated cable row, V-bar, elbows tucked | Lat-biased shoulder extension, loaded reach | ★ (V-bar) |
| A | Cable pullover / straight-arm pulldown (as a second lat exercise) | Lat isolation; weak as the only lat work | ✓ (rope or straight bar, high pulley) |
| B | Barbell bent-over row; single-arm DB row | Row: higher skill and low-back fatigue, good strength value | ✓ |
| C | Farmer carry, inverted row for trained lifters | Not a lat hypertrophy stimulus | ✓ but exclude |

**Upper back and traps**

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | Chest-supported row (incline DB / T-bar / machine), elbows wide | Stab high, Fat low, no spinal load | ★ (incline-bench DB row) |
| A | Seated cable row, wide grip; seal row; barbell row | Cable keeps load at reach; barbell row adds strength value | ★ straight-bar wide row; ✓ barbell row |
| A (upper traps) | DB / barbell shrug | Simple, progressable | ✓ |
| B | Face pull (rope); rack pull; Meadows row | Face pull also counts as rear-delt work | ✓ |
| C | Farmer carry, upright row, band pull-aparts as main work | Incidental trap stimulus, high fatigue, shoulder risk | Exclude |

**Front delts.** They receive about 0.5 credit per pressing set, so direct work is often unnecessary.

| Tier | Exercise | Home |
|---|---|---|
| S | Seated DB overhead press (back-supported) | ★ |
| S (strength S) | Standing barbell overhead press | ★ for strength goals |
| A | Incline press (credit only); landmine press | ✓ / ~ |
| B | Front raise (usually redundant) | ✓ |
| C | Arnold press as primary, behind-the-neck press | Avoid |

**Side delts**

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | DB lateral raise; cable lateral raise; machine lateral | Cable ≈ DB for growth (Larsen 2025, Moderate) | ★ DB (bilateral, half the clock time of alternating cable); ✓ cable |
| A | Cable Y-raise / lean-away raise; overhead press (partial credit) | | ✓ |
| B | Wide-grip upright row, Lu raise | Joint stress | ✓ |
| C | Heavy cheated upright row, band laterals | | Avoid |

**Rear delts**

| Tier | Exercise | Home |
|---|---|---|
| S | Reverse pec deck; single-arm cross-body cable reverse fly | ✗ / ★ single-arm cable (D-handle) |
| A | Face pull (rope, externally rotated); chest-supported DB rear raise; wide-elbow chest-supported row | ★ face pull; ✓ others |
| B | Bent-over DB reverse fly | ✓ |
| C | Band pull-aparts as primary | Avoid |

**Biceps**

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | Incline DB curl | Long length, proximal growth (Kassiano 2025) | ★ |
| S | Preacher curl (EZ / DB / machine) | Distal growth; preacher ≈ Bayesian curl | ★ EZ-bar over the incline backrest |
| S | Bayesian (behind-body) cable curl | ≈ preacher for growth | ✓ (low pulley, D-handle) |
| A | EZ / barbell curl; cable curl; hammer / rope hammer curl; chin-up | Prog high; hammer adds brachialis and forearm credit | ✓ |
| B | Concentration, spider, drag curl | Short-length emphasis | ✓ |
| C | Reverse curl as a biceps exercise; rows as the only biceps work | Mannarino 2021 | Avoid as biceps primary |

**Triceps**

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | Overhead cable extension (rope or single-arm) | 1.4× growth vs neutral arm (Maeo 2023) | ★ (rope, high pulley turned away) |
| S | EZ / DB skull crusher with arms angled back | Long-head stretch at heavier loads | ★ EZ bar |
| A | Cable pushdown; close-grip bench; weighted dip; JM press | Pushdown complements overhead work | ✓ all |
| B | Cable kickback, machine extension | | ✓ / ✗ |
| C | Bench dips, DB kickback, diamond push-ups for trained lifters | Shoulder stress, no load at stretch | Avoid |

**Forearms.** No hypertrophy trials exist, so this is optional and Speculative. Hammer curl, reverse EZ curl, and wrist curl or reverse wrist curl are A-tier (all ✓). Farmer carries and plate pinches are B and count as grip or conditioning work. Forearms should be an opt-in accessory, never a default pull-day slot.

**Quadriceps.** Treat the vasti (any deep knee-dominant compound) and the rectus femoris (needs knee extension) as two coverage requirements.

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | Hack squat, full depth | Stab high, LL high (consensus, no RCT) | ✗ |
| S/A | High-bar back squat, full depth | Also glutes and adductors (Kubo 2019); Fat 4, skill high | ★ (main quad compound) |
| A/S | Leg press, deep | Also glute max ~15% and adductor magnus | ✗ |
| S for rectus femoris | Leg extension, reclined (~40° hip) | Only reliable rectus femoris grower (+13.2% vs +1.1%) | ✗; home stand-in: sissy squat or reverse Nordic (hip extended, knee deep; untested, Low) ~, or a cable leg extension with a ~$15 ankle cuff |
| A | Front squat / heels-elevated front squat | More upright, quad-biased; Fat 4 | ★ (second quad compound) |
| A/B | Bulgarian split squat | Hip-dominant, unilateral (doubles time), Fat 3 | ★ |
| A | Pendulum / belt squat | | ✗ |
| B | Walking lunge | Conditioning-heavy | ✓ |
| C (hypertrophy) / A (powerlifting) | Pause squat, box squat, half or quarter squat | Strength and technique tools | ✓ strength goals only |

**Hamstrings.** These need both a knee-flexion exercise and a hip hinge. Squats and leg press earn 0 hamstring credit.

| Tier | Exercise | Why | Home |
|---|---|---|---|
| S | Seated leg curl | Maeo 2021, ~14% vs ~9% | ✗; home stand-in: hip-flexed prone DB leg curl on the incline bench (mimics seated curl hip angle; untested, Low) ~ |
| S/A | Romanian deadlift | LL high, Prog high, Fat 3; semimembranosus and long head | ★ (hinge slot) |
| A | Lying leg curl; stiff-leg deadlift | | ✗ / ✓ |
| A/B | 45° back extension, hamstring-biased | | ✗ |
| B | Nordic curl | Very high eccentric stretch, but hard to scale and very sore; ≈ SLDL for growth in one RCT | ✓ (anchor under the pulldown pad or a low barbell) as a second knee-flexion option |
| B | Good morning | Skill and spinal load | ✓ |
| C (hypertrophy) / S (powerlifting) | Conventional or sumo deadlift | Low hamstring LL, Fat 5 | ✓ strength goals |

**Glutes.** Glute max needs no isolation if deep squats or split squats plus a hinge are programmed.

| Tier | Exercise | Home |
|---|---|---|
| S | Deep squat (back, front, hack) | ★ |
| A/S | Barbell or machine hip thrust (≈ squat for glutes, Plotkin 2023) | ✓ (barbell + bench), for glute-priority users |
| A | Bulgarian split squat / deficit reverse lunge; deep leg press; RDL | ★ BSS, ★ RDL; leg press ✗ |
| B | 45° back extension (glute-biased); seated machine hip abduction | ✗ |
| C | Cable kickback, cable hip abduction | Exclude as default filler |

**Adductors.** Deep squats are S (★). Leg press is A (✗). The adduction machine is B (✗), the Copenhagen plank B (✓, bench), and sumo deadlift B (✓, but Fat 5). Cable adduction is C. Squats grew the adductors more than hip thrusts did ([Plotkin 2023](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1279170/full)), so isolation is optional.

**Calves.** A straight-knee raise with a deep, paused stretch is required. A bent-knee raise is the soleus complement.

| Tier | Exercise | Home |
|---|---|---|
| S | Standing calf-raise machine, deep stretch | ✗ |
| S/A | Leg-press calf raise; Smith calf raise on a step | ✗ |
| A | Seated calf raise (soleus) | ~ barbell or DBs on the knees, toes on a plate |
| B | Single-leg DB calf raise on a step; barbell standing raise on plates in the rack | ★ single-leg DB (best home gastrocnemius option) |
| C | Flat-floor calf raise; carries or jumps as calf work | Avoid |

**Erectors.** The loaded 45° or 90° back extension is A (✗). The RDL is A (★, it also counts for hamstrings). Conventional deadlift and good morning are B (✓). Supermans and bird-dogs are C, for warm-up or rehab only. One RCT found RDL training did not raise isolated lumbar-extension torque, while lumbar-extension training raised the RDL ([lumbar RCT](https://pubmed.ncbi.nlm.nih.gov/23867152/)). Direct erector work is therefore optional and low priority.

**Abs.** Loaded, progressive spinal flexion builds the rectus abdominis. Planks train stability, and upper vs lower ab emphasis did not change regional growth ([crunch ultrasound](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10824285/)) (Low).

| Tier | Exercise | Home |
|---|---|---|
| S/A | Cable crunch | ★ (rope, high pulley) |
| A | Weighted or decline crunch; ab-wheel rollout | ✓ / ~ |
| B | Hanging or dip-station knee raise (hip-flexor dominant unless the pelvis curls); cable woodchop or Pallof press for obliques | ✓ |
| C | Plank, superman | Warm-up or beginners only |

## Goal, not level, decides reps, rest and effort; level mainly sets volume and margin

Load matters for strength but barely for size. Across 21 studies, low (≤60% 1RM) and high loads produced similar hypertrophy, but high loads produced more strength ([Schoenfeld 2017 load MA](https://pubmed.ncbi.nlm.nih.gov/28834797/)). Lopez's network meta-analysis compared sets of ≤8, 9–15 and >15 reps taken to failure. Hypertrophy did not depend on load. Strength was best with heavy loads, and moderate loads still beat light ones ([Lopez 2021](https://pubmed.ncbi.nlm.nih.gov/33433148/)). Currier's Bayesian network covered 178 strength and 119 hypertrophy studies. It found >80% 1RM maximized strength and that every prescription built muscle comparably ([Currier 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10579494/)) (High). Isolation work goes higher in reps because heavy low-rep isolation stresses joints and is hard to load in small steps. Beginners use 8–12 reps on compounds even for strength, because untrained lifters gain at any load and technique is easier to learn lighter (both inferences). There is no special "toning" range for fat loss.

Proximity to failure matters for size and much less for strength. In a meta-analysis, failure beat non-failure only marginally (ES 0.19, CI 0.00–0.37), and the advantage disappeared when non-failure was defined consistently ([Refalo 2023](https://pubmed.ncbi.nlm.nih.gov/36334240/)). Robinson's continuous-RIR meta-regression found that only hypertrophy was meaningfully affected by RIR, and strength was flat across a wide range ([Robinson 2024](https://sportrxiv.org/index.php/server/preprint/view/295)). In trained lifters, stopping at 1–2 RIR matched failure for quad growth but caused less fatigue and less rep loss across sets ([Refalo 2024](https://pubmed.ncbi.nlm.nih.gov/38393985/)) (Moderate). The practical split is 1–3 RIR on compounds, 0–2 on isolations (last set optionally to failure), and a wider buffer for beginners, who misjudge RIR.

Rest follows the same split. Hypertrophy needs more than 60 s, with no detectable gain past about 90 s ([Singer 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11349676/)). Short rest costs mostly volume load, and matched-volume short rest performs similarly ([Longo 2022](https://pubmed.ncbi.nlm.nih.gov/35622106/)). Untrained people do fine with either ([Grgic 2017](https://pubmed.ncbi.nlm.nih.gov/28641044/)). Strength rewards 3–5 minutes ([de Salles 2010](https://pubmed.ncbi.nlm.nih.gov/19811949/)) (Moderate). That compounds need longer rest than isolations is practitioner reasoning.

Exercise order matters for the strength of whatever comes first and not for hypertrophy (ES 0.03, p = 0.86) ([Nunes 2021](https://pubmed.ncbi.nlm.nih.gov/32077380/)) (Moderate). The order should run power or explosive work, then the goal's main lift, then the remaining compounds from larger to smaller, then isolations, then core and carries. A user-flagged priority muscle can jump to the front. Warm-up ramps (2–3 sets for a hypertrophy first compound, 3–5 for heavy strength work, 0–1 for isolations after a related compound) are practitioner convention ([StrengthLog](https://www.strengthlog.com/warm-up-before-lifting/)) (Low). The ACSM 2026 position stand reinforces the low stakes. It found training to failure, equipment type and complex periodization "did not consistently impact outcomes" in average healthy adults ([ACSM 2026](https://acsm.org/resistance-training-guidelines-update-2026/)).

| Goal | Main compound reps | Secondary compound reps | Isolation reps | RIR compound / isolation | Rest main / secondary / isolation (s) | Sets per exercise |
|---|---|---|---|---|---|---|
| Build muscle | 6–10 | 8–12 | 10–20 | 1–3 / 0–2 (last set may hit failure) | 120–180 / 90–150 / 60–90 | 2–4 |
| Get stronger | 3–6 (~80–90% 1RM) | 6–10 | 8–15 | 2–4, top sets 1–2 / 1–3 | 150–240 / 120–180 / 60–90 | Main 3–5, others 2–3 |
| Powerlifting | 1–5 (~80–92%+; singles and doubles for advanced) | 4–8 | 8–15 | 2–4, top singles 1–2 / 1–3 | 180–300 / 120–180 / 60–120 | Main 3–6, others 2–3 |
| Get lean | 6–10 | 8–12 | 10–15 | 2–3 / 1–3 | 90–120 / 60–90 / 45–75 or supersets | 2–3 |
| Weight loss | 8–12 | 10–15 | 12–15 | 2–3 / 1–3 | 90–120 / 60–90 / 45–75, supersets and circuits by default | 2–3 |
| General fitness | 6–12 | 8–12 | 10–15 | 2–3 / 1–3 | 90–150 / 90–120 / 60–90 | 2–3 |

Level modifiers: beginners add +1 RIR (compounds 2–4, isolations 1–3), use 8–12 reps on compounds for every goal, rest 60–90 s on isolations, and do 1–2 warm-up sets. Advanced users may use lower reps on main lifts and more exercises per muscle. Rep and rest ranges are evidence-bounded (Moderate–High). The cut-points and the weight-loss row are Design.

## Supersets halve the clock; double progression and volume-cut deloads drive the long game

Supersets are the best-supported time saver. A 19-study meta-analysis found they cut session time with a large efficiency effect (SMD 1.74) while matching traditional sets for strength, strength endurance and hypertrophy (SMD −0.05). The costs were higher RPE (SMD 0.77) and lactate. Agonist-antagonist pairs allowed **more** reps, while same-muscle pairs **reduced** volume load ([Zhang 2025](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12011898/)) (Moderate–High). Paired bench pulls and bench presses roughly doubled work per minute with equal volume load ([Robbins 2010](https://pubmed.ncbi.nlm.nih.gov/20555283/)). A whole-body superset session in trained lifters ran 23 minutes shorter for 4.2% less volume ([Frontiers in Psychology 2022](https://doaj.org/article/5cbd8a74af4545d7ae2d1741e24cc7c9)). Tri-sets were the densest option measured in kg per minute, at higher RPE ([Weakley 2017](https://link.springer.com/doi/10.1007/s00421-017-3680-3)). Drop sets matched traditional sets for hypertrophy ([Sødal 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10390395/)) and showed only trivial strength differences (ES 0.07) ([Coleman 2022](https://vuir.vu.edu.au/46296/)). Rest-pause matched or beat multiple sets in small trials ([Prestes](https://pubmed.ncbi.nlm.nih.gov/28617715/); [Enes 2021](https://pubmed.ncbi.nlm.nih.gov/34260860/)) (Low–Moderate). Iversen's review concludes that these methods roughly halve session time and are "probably better at inducing hypertrophy than muscular strength" ([Iversen 2021](https://pubmed.ncbi.nlm.nih.gov/34125411/)). The generator should therefore superset accessories and arms freely when time is tight. It should keep strength users' main lifts as straight sets, avoid same-muscle pairs, put drop sets and rest-pause on the last set of machine, cable or dumbbell isolations only, and limit dense techniques for beginners because of the RPE cost.

Progression has a simple evidence base. Adding load and adding reps both worked in trained lifters, with reps slightly ahead for rectus femoris size and load slightly ahead for strength ([Plotkin 2022](https://peerj.com/articles/14142)). That supports double progression for hypertrophy and accessory work, and load progression for main strength lifts (Moderate). RPE-based loading matched or slightly beat fixed %1RM, with a 57–79% chance of a small 1RM advantage ([Helms 2018](https://pubmed.ncbi.nlm.nih.gov/29628895/)). RIR autoregulation beat fixed block loading for front-squat strength ([Graham & Cleather](https://research.stmarys.ac.uk/id/eprint/3067)). Forge should therefore track e1RM from logged reps and RIR rather than rely on tested maxes (Moderate). Load increments (for example +2.5 kg upper, +5 kg lower, next dumbbell) are convention with no peer-reviewed source.

Periodization helps strength but not size. Periodized training beat non-periodized for 1RM (ES 0.43) ([Williams 2017](https://link.springer.com/article/10.1007%2Fs40279-017-0734-y)). Undulating beat linear for 1RM (ES 0.31), driven entirely by trained lifters (ES 0.61), with no hypertrophy difference (ES 0.05) ([Moesgaard 2022](https://pubmed.ncbi.nlm.nih.gov/35044672/)) (Moderate). Beginners get simple session-to-session progression. Trained strength and powerlifting users get daily undulating intensity. Hypertrophy users get whatever keeps volume and effort high. Block periodization lacks the evidence to claim any specific advantage.

Deloads are practice-based. Coaches define them as planned reductions mainly in volume ([Bell 2023 Delphi](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10511399/)). Competitive athletes deload for about 6 days every **5.6 ± 2.3 weeks**, cutting sets and reps while keeping frequency and exercise selection ([Rogerson 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10948666)). S&C coaches most often cut volume by 0–25% ([De Marco 2024](https://pubmed.ncbi.nlm.nih.gov/39446750/)). A full week off mid-program did not change hypertrophy but **reduced** strength gains ([Coleman 2024](https://peerj.com/articles/16777)) (Low–Moderate). Variation should be systematic and modest. Random or excessive swapping can compromise gains ([Kassiano 2022](https://pubmed.ncbi.nlm.nih.gov/35438660/)), while varied and fixed routines performed similarly when variation was planned ([Kassiano 2024](https://ro.ecu.edu.au/ecuworks2022-2026/4912)). Keep main lifts stable across a mesocycle and rotate about one accessory per muscle per block.

## The earlier PPL/UL program mostly holds up, but its per-session volume was conservative

The earlier research that became Forge's 8-week Push/Pull/Legs/Upper/Lower program was built for an intermediate lifter's home gym. It targeted about 10–14 effective sets per muscle per week, trained twice weekly across five days.

**Where the new evidence agrees.** The new notes confirm the program's framework almost point for point:
- **Counting.** Fractional counting at 0.5 per synergist set is now the published Pelland result rather than a preprint.
- **Frequency.** Twice-weekly frequency as a volume-distribution tool, not a growth driver, matches the +0.32% per session finding.
- **Effort.** 1–2 RIR on compounds and 0–1 on isolations, justified by Refalo 2024 and Robinson 2024, matches the new effort table.
- **Exercise choices.** Overhead triceps extension (Maeo 2023) and a hip-flexed leg curl standing in for the seated curl (Maeo 2021) both survive, as do incline pressing for the upper chest and deep, paused calf raises (Kassiano 2023). Using squats instead of hip thrusts for glutes (Plotkin 2023) also holds.
- **Progression and recovery.** Double progression (Plotkin 2022), a reduced-volume deload rather than a week off (Coleman 2024, Bell 2023), and supersetting arms on the Upper day (Zhang 2025) all hold.
- **Evidence standards.** Lengthened partials only after full-range failure (Wolf 2025) and the explicit distrust of EMG (Vigotsky, Plotkin) match the new notes.
- **Block length.** The 5-loading-week plus 1-deload-week block sits inside the practice norm of about 5.6 weeks between deloads.

The new incline evidence comes from different trials than the earlier program cited ([Chaves 2020](https://digitalcommons.wku.edu/ijes/vol13/iss6/12)), but it reaches the same upper-pec conclusion. The new regional curl data also justify a choice the program made on weaker grounds: incline curls on Pull and EZ preacher curls on Upper. Kassiano 2025 shows those two exercises grow different ends of the biceps, so the pairing provides genuine complementary coverage rather than just variety.

**Where it disagrees or refines.**
- **Per-session volume.** The program described twice-weekly training as capping a session at "about 6–10 sets per muscle." That is the same conservative reading that produced the generator's 6–8 cap. Remmert's per-session estimate of about 11 fractional sets means the program had headroom, though its actual sessions (for example 8 direct chest sets on Push) were already fine.
- **Weekly volume.** The program leaned on Aubé 2022 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/32058362/)) to treat 12, 18 and 24 weekly quad sets as equivalent and settled at 10–17. Pelland's continuous model shows no hard plateau. An intermediate can expect detectable extra growth moving from about 12 to about 18–20 sets for priority muscles, at about 8.5 sets per increment. The program's 10–14 effective sets sit in the efficient lower-middle tier, which is a defensible choice but not a ceiling.
- **Laterals.** The low-pulley cable lateral raise was justified on long-length loading, but Larsen 2025 found cable and dumbbell laterals equivalent. Since the program prescribes 5 lateral sets per session done one arm at a time, switching to bilateral dumbbell laterals would cut that slot's time roughly in half at no cost.
- **Seated-curl advantage.** The program said seated curls produced "substantially more" hamstring growth. The real whole-muscle gap was about 14% against 9%, a moderate advantage, not a large one.
- **Nordic curl.** The new tiers rate the Nordic B (hard to scale, very sore) and place it behind the RDL and the curl stand-in. Its role on Legs day as the only knee-flexion exercise there is acceptable, but it should be a second option rather than a primary slot in Forge's generator.
- **Flyes.** The deep-stretch dumbbell flye is B-tier in the new ranking (no load at the top, shoulder stress when heavy). A single-arm low-to-high cable fly or weighted dip is the better home option for that slot.
- **Abs.** The revised program switched optional abs to hanging knee raises. Cable crunches with the rope, which the user owns, rank higher for rectus abdominis growth.
- **Rest.** The program's rest on heavy compounds (3–4 min on bench) is longer than the hypertrophy evidence requires. Singer 2024 detected no added benefit past about 90 s, so a time-budgeted generator should default to 2–3 minutes for hypertrophy compounds and reserve 3–5 for strength goals.
- **Deloads.** The program's deload halves sets. That is more aggressive than typical coach practice (most commonly a 0–25% volume cut) but within the consensus definition, so it remains reasonable.

**What the new evidence adds.** The earlier work covered one goal (hypertrophy), one level (intermediate) and a fixed weekly plan. The new research supplies the pieces a generator needs:
- volume, rep, RIR and rest prescriptions for strength, powerlifting, fat loss and general fitness at three levels, anchored on ACSM 2026 and the Pelland strength curve;
- a per-session ceiling and a time model that turns minutes into sets;
- goal-specific exercise tiers, so pause squats and deadlifts belong to strength plans, not hypertrophy plans;
- a systemic-fatigue score and limits on fatigue-heavy lifts;
- free-weight vs machine equivalence (Haugen 2023), which lets the generator substitute freely when equipment differs;
- the rectus femoris requirement for knee extension, which the program met with sissy squats and which Forge should enforce as a coverage rule;
- quantified superset, drop-set and rest-pause trade-offs;
- periodization by goal and training status, with undulating loading for trained strength users;
- e1RM-based autoregulation;
- plateau handling.

## Algorithm spec

Tags: **[E-H]** evidence, high confidence; **[E-M]** evidence, moderate; **[E-L]** evidence, low (single study, preprint, EMG, or consensus); **[D]** design choice inside an evidence-supported range. All set counts are fractional (direct 1.0, meaningful synergist 0.5, stabilizer 0) unless stated.

### 1. Muscle model and fractional credit

1. Track these muscles: chest, front delts, side delts, rear delts, lats, upper back (mid/lower traps and rhomboids), upper traps, biceps, triceps, forearms, quads, hamstrings, glutes, adductors, calves, erectors, abs. Forearms, adductors, erectors and upper traps are **optional** muscles. They get no weekly target unless the user opts in, and they are satisfied by compound credit [D].
2. Each exercise gets credits of only 0, 0.5 or 1.0 per muscle. No study supports graded weights like 0.25 or 0.75 [E-M]. Default patterns are listed below. Squats, leg press and hip thrusts give **0** hamstring credit [E-M, Kubo 2019, Plotkin 2023].

| Pattern | 1.0 | 0.5 |
|---|---|---|
| Horizontal / incline press, dip | chest | triceps, front delts |
| Vertical press | front delts | side delts, triceps |
| Vertical pull | lats | biceps, rear delts, upper back |
| Row, elbows tucked | lats, upper back | biceps, rear delts |
| Row, elbows wide; face pull | upper back, rear delts | biceps (row only) |
| Squat / leg press / split squat | quads | glutes, adductors |
| Hinge (RDL, SLDL, good morning) | hamstrings | glutes, erectors, adductors |
| Hip thrust | glutes | — |
| Leg curl / Nordic | hamstrings | — |
| Hammer or reverse curl | biceps (hammer) / forearms (reverse) | forearms (hammer) |

3. Coverage flags must be met **per week**, not per session [E-M]: chest = incline press ≥1 and flat or dip ≥1. Triceps = overhead extension ≥1. Biceps = long-length curl (incline or Bayesian) ≥1 and preacher-type ≥1 (hypertrophy goals). Back = vertical pull ≥1 and horizontal row ≥1. Hamstrings = hinge ≥1 and knee-flexion ≥1. Quads = knee-dominant compound ≥1 and knee extension ≥1 (hypertrophy goals, or the sissy-squat/reverse-Nordic stand-in when no machine is available). Calves = straight-knee deep-stretch raise ≥1.

### 2. Weekly targets and frequency

4. Look up the weekly target and per-session soft and hard caps from the goal × level table in the first section [E-M ranges, D defaults]. Apply a +25–50% target to user-flagged priority muscles, capped at the level maximum (advanced 30), and −25% (never below 4) to de-prioritized ones [D].
5. Never schedule a muscle below **4 fractional sets/week** [E-M, Pelland minimum effective dose]. If the time budget forces it, warn the user.
6. Choose the split from days per week [D]: 2 days = full body; 3 = full body; 4 = upper/lower; 5 = PPL + upper/lower (the user's current program); 6 = PPL ×2. Then require, per muscle, **sessions/week ≥ max(2, ceil(weekly target ÷ session soft cap))** [E-M]. If the split cannot meet that, lower the weekly target to frequency × soft cap and tell the user.
7. For strength and powerlifting, each main lift (squat, bench, plus overhead press for get-stronger) appears **2–3× per week**, with deadlift **1–2×** [E-M, Pelland frequency–strength].

### 3. Per-session set budget

8. **Base budget** for muscle m on this day: `base_m = round(weekly_target_m ÷ sessions_hitting_m)`, then subtract fractional credit already planned for m this week beyond the expected share, so the week stays on target [D].
9. **Ceiling**: `max_m = session_soft_cap(goal, level)`, never above the hard cap (14 for hypertrophy, 10–11 for all other goals). For strength goals, the main lift itself gets **2–5 heavy sets** (Remmert's PUOS is about 2 direct sets, ACSM says 2–3 per exercise) [E-M]. Additional volume goes to variations and accessories, counted toward hypertrophy budgets.
10. **Floor**: every muscle the day is responsible for gets at least `min_m` (2–3 direct sets) even in short sessions [D].
11. Track the **weekly running total** per muscle and do not let a session push a muscle past its weekly upper range (beginner 12, intermediate 20, advanced 24, priority 30) [E-M/D].

### 4. Time model

12. Constants, all user-calibratable from logged timestamps [E-L/D]:
    - `sec_per_rep` = 3 (4 for sets of 5 or fewer reps)
    - `set_overhead` = 10 s; unilateral exercises double the rep time
    - `warmup_set` = 70 s
    - `transition` = 60 s (same cable or DB station), 90–120 s (new station), 180 s (heavy barbell)
    - `general_warmup` = 5 min
13. Per exercise: `T = warmups × 70 + sets × (reps × sec_per_rep + 10) + (sets − 1) × rest + transition`.
14. Warm-up sets [E-L]: first heavy compound, strength or powerlifting, 3–5. First compound, other goals, 2–3. A later compound for already-warm muscles, 1–2. Isolation after a related compound, 0–1. Bodyweight, 0. Beginners, 1–2.
15. Superset pair: `T = sets × (set_A + set_B + 15 s) + (sets − 1) × rest_after_pair (90–120 s) + one transition`.
16. Sanity table for validation (hypertrophy, straight sets; strength −30%; supersets +30–50%) [D]:

| Minutes | 30 | 45 | 60 | 75 | 90 | 120 |
|---|---|---|---|---|---|---|
| Working sets | 8–10 | 12–15 | 16–20 | 20–24 | 24–28 | 30–38 |
| Exercises | 3–4 | 4–5 | 5–6 | 6–7 | 7–8 | 8–10 |

### 5. Slot templates per day type

17. Each day type is an ordered slot list. **R** = required, **O** = optional, filled only if budget and time remain. Each slot names its pattern and target muscle [D, built on the coverage rules in step 3]:

| Day | Slots (in order) |
|---|---|
| Push | R1 main horizontal press (flat or incline, alternate across the week) · R2 second press at the other angle, or a dip · R3 chest isolation (cable fly) or dip · O4 vertical press (only if front-delt fractional < target) · R5 side-delt raise · R6 overhead triceps extension · O7 second triceps (pushdown / skull crusher) · O8 second side-delt raise · O9 accessory muscle: rear delts, abs or calves |
| Pull | R1 vertical pull · R2 chest-supported or cable row · O3 second lat exercise (single-arm pulldown, V-bar row, pullover) · R4 rear delt (face pull / reverse fly) · R5 long-length curl · O6 preacher or hammer curl · O7 shrugs · O8 accessory: abs, calves, forearms (opt-in) |
| Legs (squat focus) | R1 main knee-dominant compound (squat / hack / leg press) · R2 hinge (RDL) or knee-flexion curl · R3 quad isolation (leg extension; home: sissy squat) · O4 unilateral (Bulgarian split squat) · R5 straight-knee calf raise · O6 second hamstring exercise · O7 abs |
| Lower (hinge focus) | R1 hinge (RDL) · R2 second quad compound (front squat / BSS) · R3 knee-flexion curl · O4 quad isolation · R5 calf raise (bent-knee if straight-knee was done earlier in the week) · O6 hip thrust (glute priority) · O7 abs |
| Upper | R1 horizontal or incline press · R2 vertical or horizontal pull · R3 second press or dip · R4 second pull (opposite plane) · R5 side-delt raise · R6+R7 biceps + triceps superset · O8 rear delt |
| Full body | R1 squat pattern · R2 horizontal press · R3 vertical or horizontal pull · R4 hinge or curl · O5 vertical press or second pull · O6 side-delt raise · O7 arm superset · O8 calves / abs |
| Strength / powerlifting | R1 competition lift of the day (straight sets) · O2 second competition lift or close variation (pause, tempo, close-grip, deficit) · then hypertrophy slots for that day's muscles, using hypertrophy tiers |

### 6. Exercise scoring and tiers

18. **Hard filters**, applied before scoring: required equipment is available; the exercise is not on the user's injury exclusions; the exercise is not C-tier for the goal unless the user explicitly picked it or it is the only option left (log a warning) [E-M/D].
19. Store per exercise: `goal_tier{hypertrophy, strength, powerlifting, general}` ∈ {S, A, B, C}; `long_length` 1–5; `stability` 1–5 (machine 5, barbell bilateral 3–4, unilateral free weight 2–3, single-arm cable 2–3); `overload_ease` 1–5 (bodyweight-only Nordic, plank or superman = 1); `systemic_fatigue` 1–5 (conventional or sumo deadlift 5; back squat, front squat and good morning 4; RDL, BSS and hack squat 3; leg press 2–3; hip thrust 2; machine or cable isolation 1); `skill` 1–5; `joint_stress` 1–5; `strength_transfer` 1–5; `regions[]` (for example `upper_chest`, `triceps_long`, `biceps_distal`, `rectus_femoris`); `evidence_level` ∈ {longitudinal, biomech, emg, consensus} [E-M attributes; D values].
20. Score (all weights Design; tune by inspection):

```
score = TIER_BASE[goal_tier[goal]]          // S 100, A 80, B 55, C 15
      + w_ll   * long_length                // hypertrophy/lean/general 4, strength 1
      + w_stab * stability                  // hypertrophy 3, beginner +2 extra
      + w_prog * overload_ease              // 3 all goals
      - w_fat  * systemic_fatigue           // hypertrophy/lean 4, general 3, strength 1, PL 0
      - w_skill* skill                      // beginner 4, intermediate 1, advanced 0
      - 3 * max(0, joint_stress - 2)
      + w_str  * strength_transfer          // strength/PL 6, else 0
      + 15 if it covers a weekly coverage flag or region not yet covered
      - 25 if same movement pattern + same target already in this session
      - 40 if picked in each of the last 3 sessions of this day type and not a main lift (rotation)
      + 10 if user favourite; consistency bonus +20 for the main lift used last week (keep main lifts stable)
```

21. Fatigue constraints [E-L/D]: for non-strength goals, at most one exercise with `systemic_fatigue` 5 per week. Never two lower-body compounds with fatigue ≥ 4 as the main lifts of one session. Never place a fatigue-4/5 axial lift after isolations of the same muscles.
22. Tier anchors that must hold (regression tests), for **hypertrophy**:
    - Main chest press ∈ {incline DB, barbell bench, flat DB, machine press, weighted dip}, never floor press.
    - Pull-day slots never contain farmer carry or reverse curl.
    - The main leg compound ∈ {squat to depth, hack squat, leg press, front squat, pendulum}, never pause squat, box squat or sumo deadlift.
    - The hinge ∈ {RDL, SLDL, back extension}.
    - No superman, plank, cable abduction or cable adduction as filler.

    For **powerlifting**, pause squat and sumo deadlift (if the user competes sumo) are valid R1/O2 picks.

### 7. Session fill loop

23. Algorithm [D, implementing the steps 3 and 4 rules]:

```
plan = []
for slot in template where slot.required:
    ex = best_scoring(slot); sets = clamp(needed(slot.muscle), 2, 4)   // strength main: 3–5
    add(plan, ex, sets)
until every day muscle reaches base_m or time_est > target:
    add sets (max 4 per exercise) or next exercise for the muscle with the largest deficit
    // exercises per muscle per session: beginner 1–2; else 2–3 big muscles, 1–2 small muscles
if time remains:
    (a) raise priority muscles, then others, from base_m toward max_m
    (b) fill optional slots for muscles NOT trained to cap today (rear delts, abs, calves, forearms if opted in)
    (c) stop; return the shorter session flagged "complete: every muscle at its evidence-based cap"
if time_est > target: run the trimming order (step 9) until it fits
```

Never add sets to a muscle already at `max_m` just to use time. That is the specific failure the evidence argues against, in mirror image of today's bug.

### 8. Ordering

24. Order the session as follows: power or explosive work → the goal's main lift → remaining compounds, larger muscles and higher fatigue first → isolations → core and carries last [E-M for strength-first, D otherwise]. A priority muscle's first exercise may move to position 1 for hypertrophy goals (order does not affect growth) [E-M, Nunes 2021]. Superset pairs keep the position of their earlier member.

### 9. Time-savers and trimming

25. **Trimming order** when estimated time exceeds the target [E-L/D]:
    1. Cut isolation rest to its floor.
    2. Pair non-competing or antagonist accessories into supersets.
    3. Convert unilateral isolations to bilateral (for example DB laterals instead of alternating cable).
    4. Drop the last set of isolations.
    5. Drop optional slots.
    6. Cut compound rest last.

    Never drop a muscle's sets below `min_m`, and never drop below the weekly floor of 4.
26. **Superset rules** [E-M/H, Zhang 2025; Robbins 2010]:
    - Allowed pairs: antagonists (press + row, curl + triceps extension, leg extension + leg curl), or non-competing pairs (upper + lower, calves + upper-body isolation).
    - Same-muscle pairs are forbidden unless the user requests pre-exhaustion.
    - Never superset the R1 main lift for strength or powerlifting goals. Pair it at most with a low-fatigue, non-competing mobility or core drill.
    - Session caps on dense techniques: beginners at most 1 superset pair and no drop sets; everyone else at most 3 pairs [D].
27. **Drop sets and rest-pause / myo-reps** [E-M drop, E-L rest-pause]:
    - Use only on the final set of machine, cable or DB isolations, for hypertrophy, get-lean and weight-loss goals, when time is short.
    - Volume accounting [D]: a drop set counts as 1.5 sets; a rest-pause or myo-rep cluster counts as 2 sets, and it may replace up to 3 straight sets of one isolation.
    - Never on heavy barbell compounds.
28. **Circuits and tri-sets** are the default structure for weight-loss and general-fitness sessions under 45 minutes [E-L, Weakley 2017; D].

### 10. Prescriptions

29. Reps, RIR, rest and sets per exercise come from the prescription table in the reps-and-rest section, with these level modifiers [E-H for reps by goal, E-M for RIR and rest, D for cut-points]:
    - Beginner: +1 RIR, compounds 8–12 reps for all goals, isolation rest 60–90 s.
    - Advanced powerlifting: singles and doubles allowed.
30. RIR ramp across a mesocycle for hypertrophy, the same ramp the user's current program uses [D]:

| Week | Compound RIR | Isolation RIR |
|---|---|---|
| 1 | 3 | 2 |
| 2 | 2 | 1 |
| 3–4 | 1–2 | 0–1 |
| Last loading week | 1 | 0, with partials allowed on the last set |
| Deload | 3–4 | 3–4 |

### 11. Progression, periodization, deloads, variation

31. **Hypertrophy and accessories** use double progression [E-M, Plotkin 2022]. Once all sets reach the top of the rep range at the target RIR, add the smallest increment next session and reset reps to the bottom. If the increment is more than about 7.5% of the load, first extend the range by 3–5 reps (micro-load fallback) [D; convention between 5% and 10%].
32. **Main strength lifts** use load progression driven by e1RM [E-M, Helms 2018; Graham & Cleather]. Compute e1RM from reps and RIR on every logged set, and set the next load to hit target reps at target RIR. Default increments are +2.5 kg upper body and +5 kg lower body, halved after 3 consecutive misses [D].
33. **Periodization model** [E-M, Moesgaard 2022]:
    - Beginners: linear, session to session.
    - Intermediate and advanced on strength or powerlifting: daily undulating intensity across the week's exposures to each lift (for example heavy 3–5 reps, medium 5–8, light or technique 8–10 at higher RIR).
    - Hypertrophy, get-lean and general-fitness goals: no special model; progress volume and effort.
34. **Deloads** [E-L, Rogerson 2024; Bell 2023; Coleman 2024]:
    - Every 4–8 weeks: default 5 loading weeks + 1 deload, extendable to 7 loading weeks if no fatigue flags.
    - Cut sets 30–50% and hold RIR at 3–4. Keep exercises and frequency.
    - Never prescribe a full week off for strength users.
    - Early-deload triggers: e1RM down on 2 or more lifts across 2 exposures, rising soreness or joint pain, or user-reported fatigue on 2 or more flags in a week.
35. **Variation** [E-M, Kassiano 2022/2024]:
    - Keep R1 main lifts fixed for the whole mesocycle.
    - At each new block, rotate about one accessory per muscle, keeping 70–80% of exercises. Prefer variants that cover a different region.
    - Never randomize session to session. The rotation penalty in step 6 enforces this within a block.
36. **Plateau handling**, triggered when e1RM is flat or falling for 3 exposures, or RIR is consistently 2+ below plan at the same load [E-L/D]:
    1. Deload.
    2. If the stall persists, swap the variant.
    3. Trained strength users: change the rep or intensity distribution.
    4. Hypertrophy users: add 1–2 weekly sets (within the caps) or a drop set on the final isolation set.

## Conclusion

The main shift is in what the generator optimizes. Forge's current design treats session time as something to fill and muscles as things to cap early. The evidence says the reverse. A muscle's weekly set count is the main hypertrophy dial, and it can rise well past where the generator stops. Each muscle's per-session dose saturates around 11 fractional sets, and time is only a constraint. The direct consequence for users: a "120-minute push day" is mostly a mis-specified request. The right response is a complete 80–90 minute session, or one that recruits muscles not trained that day, rather than more of the same. Surfacing that honestly in the UI, with a message that the session ended because every muscle hit its cap, will build more trust than silently padding.

The second takeaway is that most of what makes an exercise good is encodable, and goal-dependence is the key. Long-length loading, stability, ease of progression and fatigue cost separate the S-tier from the C-tier. The same exercise can be both, depending on whether the user wants size or a bigger total. The weakest links remain where the trials are thin: lats, upper back, rear delts, abs, the exact time constants, and the home-gym stand-ins for the leg curl and leg extension (hip-flexed DB curl, sissy squat), which are mechanistically sound but untested. Those are good candidates for Forge to learn from its own logs. Calibrate time per set from timestamps, and watch whether e1RM and volume progress on the stand-ins as they do on the evidence-backed picks. For this user specifically, the cheapest upgrade with the most evidence behind it is an ankle cuff for the cable station, which turns the missing leg curl and leg extension into cable versions of the two S-tier exercises the home gym currently lacks.
