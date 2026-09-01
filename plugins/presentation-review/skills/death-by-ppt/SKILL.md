---
name: death-by-ppt
description: Review MARP presentations against six cognitive-load and delivery principles.
disable-model-invocation: true
---

# Death by PowerPoint

Review MARP presentations slide by slide. Frame feedback as actionable suggestions with rationale.

## Review workflow

1. **Read the complete presentation.** Identify every slide, including title and closing slides, and its intended message. Complete when no slide is omitted.
2. **Assess each slide.** Apply the six principles and record the object count for every slide. Complete when every slide has an object count and either an explicit pass or findings.
3. **Check MARP delivery details.** For slides using images, notes, pagination, or code, load `references/marp-delivery.md` and apply its relevant checks. Complete when every applicable delivery risk is addressed.
4. **Report the review.** Use one slide-by-slide entry per slide. Add recommendations only for findings. Complete when every recommendation is traceable to a slide and principle.

## Six principles

1. **One message per slide** - state one takeaway; split competing takeaways.
2. **Maximum six visual objects per slide** - count each independently attention-demanding heading, bullet group, image, code block, icon, or diagram; flag a higher count unless the slide has one clear reading order.
3. **Speaker text belongs in notes** - visible text uses phrases or keywords; move full speaker prose into speaker notes.
4. **Direct focus with size and contrast** - make one element unmistakably first-read; text contrast meets WCAG AA: 4.5:1 for normal text or 3:1 for large text.
5. **Use backgrounds that support focus** - backgrounds preserve the required text contrast and do not compete with the first-read element.
6. **Optimise density, not slide count** - text and code remain readable at presentation size with a clear scan order; split cramped slides.

## Output contract

```markdown
### Slide N: <headline>

- Message: clear | unclear | multiple
- Objects: N | pass | exceeds limit
- Findings: pass | <principle or delivery finding>
- Recommendation: <action and rationale>
```

Omit `Recommendation` when `Findings` is `pass`.

Provide an overall priority list only after the exhaustive slide-by-slide review.