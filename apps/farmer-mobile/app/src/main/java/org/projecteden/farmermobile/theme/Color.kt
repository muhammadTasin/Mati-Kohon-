package org.projecteden.farmermobile.theme

import androidx.compose.ui.graphics.Color

// Mati Kohon's soft cream-and-teal palette, the same as the SAAO dashboard (apps/saao-dashboard/public/neo.css, plan in
// docs/ui-ux-plan.md): a warm paper, one deep teal accent, light from the top left. Four layers: base (the page),
// raised (cards, bars), inset (fields, tracks) and pressed. Text is at least 4.5:1 on its surface; controls carry an
// edge or a fill of at least 3:1, so the soft shadows never carry meaning alone.

val Primary = Color(0xFF0B4A4F)           // teal
val PrimaryContainer = Color(0xFF063A3F)  // teal, deep
val OnPrimary = Color(0xFFF8F4EA)
val OnPrimaryContainer = Color(0xFFE2EEEE)
val PrimaryFixed = Color(0xFFE2EEEE)      // teal, soft
val PrimaryFixedDim = Color(0xFF9DC7C2)   // teal, light
val OnPrimaryFixed = Color(0xFF063A3F)
val OnPrimaryFixedVariant = Color(0xFF0B4A4F)

val Secondary = Color(0xFF7F500E)         // amber, deep (warnings and dates)
val SecondaryContainer = Color(0xFFF1E2C6) // amber, soft
val OnSecondary = Color(0xFFF8F4EA)
val OnSecondaryContainer = Color(0xFF6B4208)
val SecondaryFixed = Color(0xFFF1E2C6)
val SecondaryFixedDim = Color(0xFFE6CB93)
val OnSecondaryFixed = Color(0xFF3D2706)
val OnSecondaryFixedVariant = Color(0xFF6B4208)

val Tertiary = Color(0xFF25596B)          // sky ink, deep (water)
val TertiaryContainer = Color(0xFF2E6679) // sky ink
val OnTertiary = Color(0xFFF8F4EA)
val OnTertiaryContainer = Color(0xFFE2EBF0)
val TertiaryFixed = Color(0xFFE2EBF0)     // sky, soft
val TertiaryFixedDim = Color(0xFFBBD3DE)
val OnTertiaryFixed = Color(0xFF0F3442)
val OnTertiaryFixedVariant = Color(0xFF25596B)

val Surface = Color(0xFFEDE6DA)           // base: the page
val SurfaceDim = Color(0xFFE6DECF)
val SurfaceBright = Color(0xFFF8F4EA)
val SurfaceContainerLowest = Color(0xFFF2EDE1) // raised: card face
val SurfaceContainerLow = Color(0xFFEFE9DC)    // rail
val SurfaceContainer = Color(0xFFE8E0D0)
val SurfaceContainerHigh = Color(0xFFE4DCCA)   // inset: fields and tracks
val SurfaceContainerHighest = Color(0xFFDCD1BB) // pressed

val OnSurface = Color(0xFF1F2B2A)         // ink
val OnSurfaceVariant = Color(0xFF46514F)  // text
val InverseSurface = Color(0xFF2E3C3B)
val InverseOnSurface = Color(0xFFF2EDE1)

val Outline = Color(0xFF5E5D52)
val OutlineVariant = Color(0xFFD9CFBC)
val OutlineControl = Color(0xFF8A7F6A)    // the edge of a field, a checkbox or a slider (3.2:1 on the page)
val SurfaceTint = Color(0xFF0B4A4F)

val Error = Color(0xFFA93A2B)
val ErrorContainer = Color(0xFFF3DCD5)
val OnError = Color(0xFFFFFFFF)
val OnErrorContainer = Color(0xFF8A2E20)

// Depth: the light from the top left, a warm brown shade to the bottom right
val NeoFace = Color(0xFFF2EDE1)
val NeoLight = Color(0xD9FFFFFF)
val NeoShade = Color(0x587A623E)
val NeoShadeDeep = Color(0x5C7A623E)

// Kept for the screens that still name them
val BevelLight = NeoLight
val BevelShade = NeoShade

// The panel for anything a phone says (soft teal)
val Lcd = Color(0xFFE2EEEE)
val LcdInk = Color(0xFF063A3F)
