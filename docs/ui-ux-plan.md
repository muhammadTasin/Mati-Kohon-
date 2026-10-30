# Mati Kohon: the soft cream-and-teal UI (plan)

Decided 30 Oct 2026 from the user's reference sheet (foundations, controls, navigation, data display, feedback) and a
frosted filter-panel mood image. It replaces the flat green, sharp-cornered look of 27-29 Oct on the dashboard and the
Android app. Rongu keeps his own colours; he now stands on a cream-and-teal page.

## 1. What the reference asks for

| Idea | Rule |
|---|---|
| One warm paper | Page cream `#EDE6DA`, raised surface `#F2EDE1`, inset `#E4DCCA`, pressed `#D5C5AD`. No gradients: depth comes from soft shadows. |
| Light from the top left | Every raised thing has a light shadow up-left and a warm brown shadow down-right; inset things are the opposite. |
| One accent | Deep teal `#0B4A4F` (hover `#115A5F`) for actions, the selected item, progress and alerts. Everything else stays cream. |
| Four layers | **Base** (the page), **Raised** (cards, buttons, the rail), **Inset** (fields, tracks, wells), **Pressed** (a button while pressed, a selected list row). |
| Five elevations | L1 flat, L2 hover, L3 raised, L4 modal, L5 popover. |
| Radius scale | 4 (chips, tracks), 8 (fields), 12 (list rows, small cards), 16 (cards), 24 (modals, the rail). Buttons and badges are pills. |
| Border tokens | 1px hairline, 2px regular (selected, focus), 4px thick (accent bars). |
| Icons | Material Symbols Outlined, 2px stroke, in 16 / 20 / 24px. |
| Spacing | 8, 16, 24 (with 4 and 12 for tight spots). |

The mood image adds: rounded panels with a frosted feel, pill-shaped option rows, one black-or-teal pill for the main
action, and a blue text link for "+N more".

## 2. Readability rules (soft designs fail here, so these are fixed)

- Text is at least 4.5:1 against its surface; the muted text colour is `#5E5D52` (5.2:1 on the page).
- Shadows only describe depth. Every control also has an edge or a fill that is at least 3:1 against its surround:
  fields, checkboxes, radios and sliders get a 1px `#8A7F6A` edge; buttons are filled teal.
- Focus is never a shadow alone: a 2px teal outline plus a 4px soft teal glow.
- Tap targets are at least 44px on phones. Reduced motion turns off every transition and spring.
- Sunlight check on the phone: the teal-on-cream pairs were chosen to stay readable at low screen brightness.

## 3. Components: sheet to dashboard to Android

| Sheet | Dashboard (`neo.css`) | Android (`theme/Neo.kt`) |
|---|---|---|
| Base / raised / inset / pressed | `.card`, `.stat-card`, `.form-control`, `.btn:active` | `Modifier.neoRaised()`, `neoInset()`, `neoPressed()` |
| Primary, pressed, disabled button | `.btn-primary`, `.btn.is-loading`, `.btn:disabled` | `NeoButton` colours via `MaterialTheme`, pill shape |
| Text field (helper, error, focus) | `.form-control`, `.is-error`, `.form-help` | `OutlinedTextField` with `NeoFieldShape` |
| Checkbox, radio, switch, slider | native controls restyled with `appearance:none` | Material3 `Switch`, `Checkbox`, `Slider` coloured teal |
| Tabs, steps | `.portal-tabs`, `.nav-tab`, `.rb-progress`, `.steps` | `BottomNavBar`, `TopAppBar` |
| Cards, list items, badges, avatars | `.card`, `.queue-item`, `.badge`, `.avatar` | `Card` with 16dp, `Badge` pill |
| Tooltip, table header | `[title]` hint on `.map-tip`, `.data-table th` | n/a |
| Modal, toast, alert, progress, spinner, skeleton, empty | `dialog`, `.calls-msg`, `.area-banner`, `.alert-card`, `.dim-bar-wrap`, `.spin`, `.ds-skeleton`, `.calls-empty-art` | `AlertDialog` 24dp, `OfflineBanner`, `LinearProgressIndicator` |

## 4. Screens, in order of work

1. Frame: header (raised bar), side rail (a rounded raised panel with pill items; the active item is pressed in teal),
   page cream, mobile top rail.
2. Role picker: three raised cards with photos, a pill tag each.
3. Overview: banner, three stat cards, attention cards, map card, place card, warnings.
4. Farmer portal: segmented tabs, today, weather, erosion, assistant, my farm; planner.
5. Manager screens: cases, calls, comparison, IPM, evidence, quality, cattle.
6. Rongu's dock: bubble, spotlight, chapter list and the hide button take the same tokens.
7. Android: colours, shapes, the neo modifiers, top bar, bottom bar, dialogs.

## 5. How it is checked

- A scan of every screen and every role for contrast (4.5:1 for text), for any leftover green, and for horizontal scroll
  at 375, 768 and 1280px.
- Screenshots of the role picker, overview, farmer portal and one manager screen before the commit.
- `npm test`, and `./gradlew :app:compileDebugKotlin` for the phone app.
