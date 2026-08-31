---
name: og-image-design
description: Design Open Graph and social sharing images with platform, layout, and accessibility guidance.
disable-model-invocation: true
---

# OG Image Design

Design a social-sharing image that remains legible, branded, and suitable for the intended platform.

## Workflow

1. **Establish the share context.** Identify the target platforms, content type, title, visual assets, and brand constraints. Complete when the design has an intended audience and publishing surface.
2. **Select an image specification.** Use the target platform's documented dimensions and format constraints. When a shared format is needed, use a 1200 x 630 image as a compatibility-oriented starting point and verify platform-specific requirements before publishing. Complete when the chosen dimensions are stated.
3. **Design the hierarchy.** Keep essential content inside safe margins, make the title legible at preview size, provide sufficient contrast, and use one visual priority. Complete when title, supporting text, and branding have clear roles.
4. **Choose implementation material conditionally.** Load `references/html-templates.md` only when an HTML starting point is requested. Load `references/meta-tags.md` only when page metadata is in scope. Complete when only the relevant reference path is used.
5. **Validate the output.** Check the generated asset at realistic preview size and with the intended platform inspector when available. Complete when readability, dimensions, file format, and metadata (if applicable) are confirmed.

## Common guidance

- Prefer short, high-contrast titles; avoid filling the image with body text.
- Keep critical text away from edges because platforms can crop previews.
- Use an absolute HTTPS image URL when metadata refers to a published asset.
- Keep a repeated series consistent in typography, layout, and brand placement while varying the content.
