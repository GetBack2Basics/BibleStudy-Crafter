---
name: Modern Academic Scripture System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#43474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#74777d'
  outline-variant: '#c4c6cd'
  surface-tint: '#4e6073'
  primary: '#162839'
  on-primary: '#ffffff'
  primary-container: '#2c3e50'
  on-primary-container: '#96a9be'
  inverse-primary: '#b5c8df'
  secondary: '#5e5f56'
  on-secondary: '#ffffff'
  secondary-container: '#e4e3d7'
  on-secondary-container: '#64655c'
  tertiary: '#342400'
  on-tertiary: '#ffffff'
  tertiary-container: '#503800'
  on-tertiary-container: '#c7a15a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4fb'
  primary-fixed-dim: '#b5c8df'
  on-primary-fixed: '#091d2e'
  on-primary-fixed-variant: '#36485b'
  secondary-fixed: '#e4e3d7'
  secondary-fixed-dim: '#c7c7bc'
  on-secondary-fixed: '#1b1c15'
  on-secondary-fixed-variant: '#46473f'
  tertiary-fixed: '#ffdea5'
  tertiary-fixed-dim: '#e9c176'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#5d4201'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-scripture:
    fontFamily: EB Garamond
    fontSize: 34px
    fontWeight: '500'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: EB Garamond
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  body-reading:
    fontFamily: EB Garamond
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 32px
  ui-label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.02em
  ui-label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  ui-label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  display-scripture-mobile:
    fontFamily: EB Garamond
    fontSize: 26px
    fontWeight: '500'
    lineHeight: 36px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  reading-width: 720px
---

## Brand & Style

The design system is built for a serene, scholarly Bible study experience. It adopts a **Modern Academic** aesthetic, which balances the weight of historical scholarship with the clarity of contemporary interface design. 

The personality is authoritative yet approachable, minimizing digital noise to foster deep focus. The UI draws from **Minimalism** for its layout and **Tactile** design for its interactions, ensuring that every button press or card hover feels deliberate and substantial. The goal is to evoke the feeling of a well-organized physical library—spacious, quiet, and timeless.

## Colors

The palette is centered on a "Parchment and Ink" philosophy.

- **Primary (Deep Indigo):** Used for headers, primary actions, and authoritative UI elements. It provides the "Ink" contrast against the page.
- **Secondary (Warm Parchment):** The foundational surface color. It is chosen specifically to reduce the blue-light harshness of pure white, facilitating long-form reading sessions.
- **Tertiary (Muted Gold):** Reserved for highlights, active states in navigation, and "Divine" or special annotations within the text.
- **Success (Sage Green):** A soft, natural green used for reading progress, completed study plans, and positive feedback loops.
- **Neutrals:** A range of slate grays are used for secondary text and borders to maintain a scholarly, non-distracting environment.

## Typography

This system utilizes a dual-type strategy to distinguish between "Content" and "Utility."

- **The Scholar (EB Garamond):** Used for all Scripture, headings, and long-form commentary. Its classical proportions and high-contrast serifs lend a sense of history and reverence.
- **The Librarian (Inter):** Used for functional UI—menus, buttons, input labels, and metadata. This provides a modern "utility layer" that remains legible at small sizes without competing with the sacred text.

**Reading Experience:** Line height for `body-reading` is intentionally generous (1.6x) to prevent line-tracking fatigue during deep study.

## Layout & Spacing

The layout philosophy follows a **Fixed-Content Grid** for reading and a **Fluid Grid** for discovery views.

- **The Reading Room:** When in "Study Mode," the central text column is restricted to a maximum width of `720px` to optimize line length for readability.
- **Responsive Behavior:** 
  - **Desktop:** A 12-column grid with 40px margins. Side panels for "Lenses" or "Commentary" appear as fixed-position drawers or floating columns.
  - **Tablet:** Side panels collapse into a single-column view with an overlay tray for tools.
  - **Mobile:** A 4-column grid. Margins shrink to 16px. The primary focus is a single-stream "infinite scroll" of text.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** and **Ambient Shadows** rather than high-contrast lines.

- **Base Layer:** The Warm Parchment (#FDFCF0) acts as the foundation.
- **Surface Layer:** Cards and menus sit slightly above the base with a very soft, diffused shadow (`0 4px 20px rgba(44, 62, 80, 0.05)`). The shadow is tinted with the Primary Indigo to keep it integrated.
- **Focus States:** When an element is selected (like a verse), it doesn't just change color; it "lifts" slightly with a slightly more pronounced shadow and a subtle Muted Gold left-border accent.

## Shapes

The shape language is **Soft**. Sharp edges are avoided to maintain the "serene" brand promise, but overly rounded "pill" shapes are avoided to keep the academic/professional tone. 

- **Standard Elements:** Buttons, cards, and input fields use a `0.25rem` (4px) radius.
- **Selection Chips:** Use `rounded-lg` (8px) to distinguish them as interactive "lenses" or filters.
- **Separators:** Horizontal rules should be subtle 1px lines using a low-opacity version of the Primary Indigo.

## Components

- **The "Lens" Chip:** These are the primary navigation for study perspectives (e.g., Greek, Commentary, Cross-Reference). They feature a light parchment background, a subtle 1px slate-gray border, and transition to a Muted Gold background when active.
- **Scripture Cards:** Content blocks used in search results. They should have generous internal padding (24px) and use `EB Garamond` for the verse text and `Inter` for the citation (e.g., John 3:16).
- **Interactive Buttons:** Primary buttons are solid Deep Indigo with white Inter text. Secondary buttons are outlined in Deep Indigo. They should have a subtle 2px vertical offset on hover to feel "tactile."
- **Input Fields:** Search bars and note-taking areas use a minimal bottom-border only style in neutral-gray, which turns to Deep Indigo on focus, mimicking the look of a lined notebook.
- **Annotation Markers:** Small, Muted Gold icons or superscripts that appear inline with text. They should have a circular "hit area" for touch and mouse precision.