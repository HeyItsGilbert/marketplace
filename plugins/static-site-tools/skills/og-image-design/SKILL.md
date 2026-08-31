---
name: og-image-design
description: Design Open Graph and social sharing images with platform, layout, and accessibility guidance.
disable-model-invocation: true
---

# OG Image Design

Design a social-sharing image that remains legible, branded, and suitable for the intended platform.

## Workflow

1. **Establish the share context.** Identify the target platforms, content type, title, visual assets, and brand constraints. Complete when the design has an intended audience and publishing surface.
2. **Select an image specification.** Use each target platform's documented dimensions and format constraints, crop or safe area, and smallest preview. When a shared format is needed, use a 1200 x 630 image as a compatibility-oriented starting point and verify platform-specific requirements before publishing. Complete when the chosen dimensions, crop or safe area, and smallest preview are recorded.
3. **Design the hierarchy.** Keep essential content inside the documented safe area, make the title legible at the smallest preview, provide text contrast meeting WCAG AA (4.5:1 normal text; 3:1 large text), and use one visual priority. Complete when title, supporting text, and branding have clear roles and the first-read element is evident.
4. **Choose implementation material conditionally.** Load `references/html-templates.md` when an HTML starting point is requested. Load `references/meta-tags.md` when page metadata is in scope. Complete when all and only the relevant reference paths are used.
5. **Validate the output.** Check the generated asset at the recorded smallest preview and with the intended platform inspector when available. Complete when readability, documented crop or safe area, dimensions, file format, and metadata (if applicable) are confirmed.

## Common guidance

- Use a short, high-contrast title and concise supporting copy only when needed.
- Keep critical text inside documented safe areas because platforms can crop previews.
- Keep a repeated series consistent in typography, layout, and brand placement while varying the content.
