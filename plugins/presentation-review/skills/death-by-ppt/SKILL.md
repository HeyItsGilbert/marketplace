---
name: death-by-ppt
description: Review MARP markdown presentations for "Death by PowerPoint" issues. Use when asked to review, critique, or improve a presentation, check slides for clarity, or when terms like "Death by PowerPoint," "slide review," "too much text," or "presentation feedback" appear. Applies David JP Phillips' principles for cognitive optimization of slides.
---

# Death by PowerPoint Skill

Review MARP presentations using David JP Phillips' "Death by PowerPoint" principles.

## Core Principles

Apply these six principles when reviewing. Frame feedback as suggestions with rationale.

### 1. One Message Per Slide

Each slide should convey a single, clear message.

**Why:** Multiple messages split audience focus, reducing comprehension and retention.

**Check:** Can you identify one takeaway? Could this slide be split?

### 2. Maximum Six Objects Per Slide

Count: headings, bullets, images, code blocks, icons, diagrams.

**Why:** Exceeding six objects increases cognitive load ~500%. Audience shifts from *seeing* to *counting*.

**MARP notes:**

- Each `-` bullet = 1 object
- Each image/code fence = 1 object
- Fragments (`*`) still count on final render
- Speaker notes (`<!-- -->`) don't count

### 3. Avoid Sentences When Speaking

Use short phrases, keywords, or visuals — not full sentences.

**Why:** The *redundancy effect* — brains can't read and listen simultaneously. Text and speech compete; audience retains neither.

**Suggest:** Move sentences to speaker notes, reduce bullets to keywords.

### 4. Size and Contrast Direct Focus

Most important element should be largest/highest contrast.

**Why:** Attention follows: moving objects, signaling colors, contrast, size. In static slides, size and contrast guide the eye.

**MARP notes:**

- Check image sizing (`![w:600](img.png)`)
- Background images can reduce contrast — suggest `![bg opacity:0.3]`
- Verify `**bold**` and headings highlight what matters

### 5. Prefer Dark Backgrounds

Dark backgrounds shift focus to presenter, reduce glare.

**Why:** Bright slides act as light source drawing attention away from speaker.

**MARP notes:**

- Check theme (`theme: default` is light)
- Suggest `<!-- _class: invert -->` for dark mode
- Custom: `section { background: #1a1a2e; color: #eee; }`

### 6. Slide Count ≠ Problem; Density = Problem

50 clean slides > 10 cluttered slides.

**Why:** "Keep it to 10 slides" causes cramming. Audience experiences pace, not page count.

## Delivery Checks

Flag these even when design is solid:

| Issue | Flag When |
|-------|-----------|
| Reading slides | Text that presenter will likely read verbatim |
| Projector dependency | Critical info only on slides, no verbal equivalent |
| Pacing | Multiple dense slides without breathing room |

## MARP Syntax Checks

- Frontmatter: `marp: true` present, theme declared
- Slide breaks: `---` used consistently
- Images: sizing intentional (`![w:400]`, `![bg right:40%]`)
- Speaker notes: proper `<!-- notes -->` format
- Pagination: `paginate: true` doesn't clutter minimal slides
- Code blocks: long blocks should be split or use line highlights

## Output Format

**Default:** Slide-by-slide breakdown.

```
### Slide [N]: [Headline or first line]

**Objects:** [count] (list if over 6)
**Message:** [Clear / Unclear / Multiple]
**Suggestions:**
- [Actionable suggestion with rationale]
```

**Offer alternatives:**

1. **Summary list** — Group by principle
2. **Inline comments** — Return markdown with `<!-- REVIEW: ... -->` inserted
3. **Priority only** — Top 3-5 most impactful changes

## Example Output

```
### Slide 4: Why Static Sites?

**Objects:** 8 (heading, 6 bullets, image)
**Message:** Multiple — covers speed, security, and cost

**Suggestions:**
- Split into three slides (one per benefit). Single ideas land better than lists.
- Image is small (`w:200`) relative to bullets. Enlarge or remove to reduce objects.
- Bullets are full sentences. Shorten to keywords — you'll expand verbally.
```

## Quick Checklist

Per slide:

- [ ] One clear message?
- [ ] Six or fewer objects?
- [ ] No full sentences (if speaking)?
- [ ] Key element is most prominent?
- [ ] Background supports focus?
- [ ] Presentable without projector?

## Attribution

Principles from David JP Phillips' TEDx talk "How to Avoid Death by PowerPoint" and multimedia learning research (Mayer, 2005).
