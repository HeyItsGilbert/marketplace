---
name: death-by-ppt
description: Review MARP presentations against six cognitive-load and delivery principles.
disable-model-invocation: true
---

# Death by PowerPoint

Review MARP presentations slide by slide. Frame feedback as actionable suggestions with rationale.

## Review workflow

1. **Read the complete presentation.** Identify every slide, including title and closing slides, and its intended message. Complete when no slide is omitted.
2. **Assess each slide.** Check one message per slide, a manageable number of visual objects, concise speaker-facing text, visual hierarchy and contrast, background focus, and density rather than raw slide count. Also check whether it can be delivered without forcing the audience to read it. Complete when each slide has findings or an explicit pass.
3. **Check MARP delivery details.** Verify frontmatter, slide breaks, image sizing, speaker notes, pagination, and code-block readability where applicable. Complete when every applicable syntax or delivery risk is addressed.
4. **Report the review.** Use one slide-by-slide entry per slide: message clarity, object count where relevant, findings, and prioritised recommendations. Complete when the reader can trace every recommendation to a slide and principle.

## Six principles

1. **One message per slide** - split competing takeaways.
2. **Limit visual objects** - headings, bullets, images, code, icons, and diagrams compete for attention.
3. **Avoid speaker text** - turn sentences into phrases or move detail to speaker notes.
4. **Direct focus with size and contrast** - make the most important element visually dominant.
5. **Use backgrounds that support focus** - preserve sufficient contrast and avoid glare.
6. **Optimise density, not slide count** - prefer several clear slides to a cramped one.

## Output contract

```markdown
### Slide N: <headline>

- Message: clear | unclear | multiple
- Findings: <principle or delivery finding, if any>
- Recommendation: <action and rationale>
```

Provide an overall priority list only after the exhaustive slide-by-slide review.