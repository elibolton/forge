# My findings (fuzz + browser)
1. wrong-advice CONFIRMED planner.ts generate trim loop: 15–20 min sessions overrun (15 min → up to 20–21 min, 20 min → 23). 3-exercise minimum, warm-ups never trimmed, sets floor 2. Fuzz: 4000 cases, only failure class.
2. wrong-advice CONFIRMED No-equipment gym, Pull day: zero pulling exercises; only crunch + calf raise extras; Today says "Every muscle today already gets the sets that help it grow". `done = !outOfTime` treats "nothing fits the equipment" as "muscles saturated".
3. wrong-advice CONFIRMED No-equipment Push day: only push-ups (+ extras), same misleading "done" message. Old "only a few push exercises suit your equipment" text would be right here.
4. wrong-advice/cosmetic Onboarding allows No Equipment + PPL/6 days with no warning that pull days are impossible.
5. cosmetic Onboarding goal copy "Reduce Bodyweight: Burn more with circuits and shorter rests" no longer true (rest 60–90 s, no auto circuits).
6. cosmetic Toast ("Set your reps before logging") draws over the workout header title, both unreadable.
7. cosmetic Finish sheet: "Keep Going" wraps to two lines; duration "0 min" for <1 min.
8. cosmetic Onboarding gym presets don't include "Home Gym (Barbell + Cables)" that You offers.
