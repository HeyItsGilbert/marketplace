---
name: og-image-design
description: "Open Graph and social sharing image design with platform specs, text placement, and branding. Covers OG meta tags, Twitter cards, LinkedIn previews, and HTML template patterns. Use for: social sharing images, blog thumbnails, link previews, social cards. Triggers: og image, open graph, social sharing image, twitter card, social card, link preview image, og meta, sharing preview, social thumbnail, meta image, og:image, twitter:image, linkedin preview"
---

# OG Image Design

Best practice guidelines for creating Open Graph (social sharing) images.

## Platform Specifications

| Platform | Dimensions | Aspect Ratio | File Size | Format |
|----------|-----------|--------------|-----------|--------|
| **Facebook** | 1200 x 630 px | 1.91:1 | < 8 MB | JPG, PNG |
| **Twitter/X (summary_large_image)** | 1200 x 628 px | 1.91:1 | < 5 MB | JPG, PNG, WEBP, GIF |
| **Twitter/X (summary)** | 800 x 418 px | 1.91:1 | < 5 MB | JPG, PNG |
| **LinkedIn** | 1200 x 627 px | 1.91:1 | < 5 MB | JPG, PNG |
| **Discord** | 1200 x 630 px | 1.91:1 | < 8 MB | JPG, PNG |
| **Slack** | 1200 x 630 px | 1.91:1 | — | JPG, PNG |
| **iMessage** | 1200 x 630 px | 1.91:1 | — | JPG, PNG |

**Universal safe bet: 1200 x 630 px, PNG or JPG, under 5 MB.**

## The Golden Layout

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  ┌─────────────────────────────────┐  ┌───────┐  │
│  │                                 │  │       │  │
│  │  Title Text (max 60 chars)      │  │ Logo/ │  │
│  │  ───────────────────            │  │ Visual│  │
│  │  Subtitle (max 100 chars)       │  │       │  │
│  │                                 │  │       │  │
│  │  author / site name             │  └───────┘  │
│  └─────────────────────────────────┘             │
│                                                  │
└──────────────────────────────────────────────────┘
  1200 x 630 px
```

## Design Rules

### Text

| Rule | Value |
|------|-------|
| Title font size | 48–64px |
| Subtitle font size | 20–28px |
| Max title length | 60 characters (gets truncated on some platforms) |
| Max subtitle length | 100 characters |
| Line height | 1.2–1.3 for titles |
| Font weight | Bold/Black for title, Regular for subtitle |
| Text contrast | WCAG AA minimum (4.5:1 ratio) |

### Safe Zones

```
┌──────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────┐│
│  │ 40px padding from all edges                  ││
│  │                                              ││
│  │  Content lives here                          ││
│  │                                              ││
│  │                                              ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

- 40px minimum padding from all edges
- Some platforms crop edges or add rounded corners
- Never put critical text in the outer 5%

### Colors

| Background Type | When to Use |
|----------------|-------------|
| Solid brand color | Consistent series, corporate |
| Gradient | Modern, eye-catching |
| Photo with overlay | Blog posts, editorial |
| Dark background | Better contrast, stands out in feeds |

**Dark backgrounds outperform light** in social feeds — most feeds have white/light backgrounds, so dark OG images pop.

## HTML Templates by Content Type

These are standalone HTML snippets at 1200×630 px. Render them with any HTML-to-image tool (Puppeteer, `@vercel/og`, Satori, `html-to-image`, sharp + SVG, etc.).

### Blog Post

```html
<div style="width:1200px;height:630px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;padding:60px;font-family:system-ui,sans-serif;color:white">
  <div style="flex:1">
    <p style="font-size:18px;text-transform:uppercase;letter-spacing:2px;opacity:0.8;margin:0">Engineering Blog</p>
    <h1 style="font-size:52px;margin:16px 0 0;line-height:1.2;font-weight:800">How We Reduced Build Times by 80%</h1>
    <p style="font-size:22px;opacity:0.9;margin-top:16px">A deep dive into our CI/CD optimization</p>
  </div>
</div>
```

### Product / Launch Announcement

```html
<div style="width:1200px;height:630px;background:#0f0f0f;display:flex;align-items:center;justify-content:center;font-family:system-ui;color:white;text-align:center">
  <div>
    <p style="font-size:20px;color:#22c55e;text-transform:uppercase;letter-spacing:3px">Now Available</p>
    <h1 style="font-size:64px;margin:12px 0;font-weight:900">DataFlow 2.0</h1>
    <p style="font-size:24px;opacity:0.7">Automated reports. Zero configuration.</p>
  </div>
</div>
```

### Tutorial / How-To

```html
<div style="width:1200px;height:630px;background:linear-gradient(to right,#1a1a2e,#16213e);display:flex;align-items:center;padding:60px;font-family:system-ui;color:white">
  <div>
    <div style="display:inline-block;background:#e74c3c;color:white;padding:8px 16px;border-radius:4px;font-size:16px;font-weight:bold;margin-bottom:16px">TUTORIAL</div>
    <h1 style="font-size:48px;margin:0;line-height:1.2">Build a REST API in 10 Minutes with Node.js</h1>
    <p style="font-size:20px;opacity:0.7;margin-top:16px">Step-by-step guide with code examples</p>
  </div>
</div>
```

### Generic Dark Card (safe fallback)

```html
<div style="width:1200px;height:630px;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;padding:60px;font-family:system-ui;color:white">
  <div>
    <h1 style="font-size:56px;margin:0;line-height:1.2">Your Title Here</h1>
    <p style="font-size:24px;opacity:0.8;margin-top:20px">yoursite.com</p>
  </div>
</div>
```

## OG Meta Tags Reference

```html
<!-- Essential (Facebook, LinkedIn, Discord, Slack) -->
<meta property="og:title" content="Title here (60 chars max)" />
<meta property="og:description" content="Description (155 chars max)" />
<meta property="og:image" content="https://yoursite.com/og-image.png" />
<meta property="og:url" content="https://yoursite.com/page" />
<meta property="og:type" content="article" />

<!-- Twitter/X specific -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Title here" />
<meta name="twitter:description" content="Description" />
<meta name="twitter:image" content="https://yoursite.com/og-image.png" />

<!-- Image dimensions (optional but recommended) -->
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

### Twitter Card Types

| Card Type | Image Size | Use When |
|-----------|-----------|----------|
| `summary` | 800 x 418 (small thumbnail) | Short updates, links |
| `summary_large_image` | 1200 x 628 (full width) | Blog posts, articles, announcements |

**Always use `summary_large_image`** unless you have a specific reason not to — the large image gets significantly more clicks.

## Consistency System

For a blog or site with many pages, keep these consistent across all OG images:

| Element | Keep Consistent | Vary |
|---------|----------------|------|
| Background style | Same gradient or brand colors | — |
| Font family | Same font | — |
| Layout | Same positioning | — |
| Logo/branding | Same placement (corner) | — |
| Category badge | Same style | Color per category |
| Title text | Same size/weight | Content changes |

## Testing OG Images

| Tool | URL |
|------|-----|
| Facebook Debugger | developers.facebook.com/tools/debug/ |
| Twitter Card Validator | cards-dev.twitter.com/validator |
| LinkedIn Post Inspector | linkedin.com/post-inspector/ |
| OpenGraph.xyz | opengraph.xyz |

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No OG image at all | Platform shows random page element or nothing | Always set `og:image` |
| Text too small | Unreadable on mobile previews | Title minimum 48px at 1200px width |
| Light background | Gets lost in white/light feeds | Use dark or saturated backgrounds |
| Too much text | Cluttered, overwhelming | Max: title + subtitle + brand |
| Image too large (>5 MB) | Some platforms won't load it | Optimize to under 1 MB ideally |
| No safe zone padding | Text cropped on some platforms | 40px padding from all edges |
| HTTP image URL | Many platforms require HTTPS | Always serve OG images over HTTPS |
| Relative image path | Won't resolve when shared | Use a full absolute URL |
