package org.projecteden.farmermobile.theme

import androidx.compose.ui.graphics.Color

// Mati Kohon's leaf-and-sky palette, the same as the SAAO dashboard (apps/saao-dashboard/public/brand.css): deep
// #054204, forest #1D6517, leaf #79B425, lime #C0DE7B, sky #55A6C3. Calm: light surfaces carry the screen and green is
// an accent (buttons, the selected item, icons); text on light surfaces is deep green or sky ink, never lime or leaf.

val Primary = Color(0xFF1D6517)           // forest
val PrimaryContainer = Color(0xFF054204)  // deep
val OnPrimary = Color(0xFFFFFFFF)
val OnPrimaryContainer = Color(0xFFEEF5E2) // lime, soft
val PrimaryFixed = Color(0xFFEEF5E2)      // lime, soft
val PrimaryFixedDim = Color(0xFFC0DE7B)   // lime
val OnPrimaryFixed = Color(0xFF054204)
val OnPrimaryFixedVariant = Color(0xFF144D10)

val Secondary = Color(0xFF7A4E08)         // amber, deep (warnings and dates)
val SecondaryContainer = Color(0xFFF8EDD6) // amber, soft
val OnSecondary = Color(0xFFFFFFFF)
val OnSecondaryContainer = Color(0xFF6B4208)
val SecondaryFixed = Color(0xFFF8EDD6)
val SecondaryFixedDim = Color(0xFFE6CB93)
val OnSecondaryFixed = Color(0xFF3D2706)
val OnSecondaryFixedVariant = Color(0xFF6B4208)

val Tertiary = Color(0xFF1F5A70)          // sky ink, deep (water)
val TertiaryContainer = Color(0xFF2A6E88) // sky ink
val OnTertiary = Color(0xFFFFFFFF)
val OnTertiaryContainer = Color(0xFFE8F3F7)
val TertiaryFixed = Color(0xFFE8F3F7)     // sky, soft
val TertiaryFixedDim = Color(0xFFBBDCE8)
val OnTertiaryFixed = Color(0xFF0F3442)
val OnTertiaryFixedVariant = Color(0xFF1F5A70)

val Surface = Color(0xFFF2F5F0)           // paper
val SurfaceDim = Color(0xFFE9EEE6)
val SurfaceBright = Color(0xFFF7FAF5)
val SurfaceContainerLowest = Color(0xFFFFFFFF) // card face
val SurfaceContainerLow = Color(0xFFF7FAF5)    // rail
val SurfaceContainer = Color(0xFFEEF2EB)       // sunk
val SurfaceContainerHigh = Color(0xFFE6ECE2)
val SurfaceContainerHighest = Color(0xFFDDE5D8) // line

val OnSurface = Color(0xFF142614)         // ink
val OnSurfaceVariant = Color(0xFF34483A)  // text
val InverseSurface = Color(0xFF243A23)
val InverseOnSurface = Color(0xFFF2F5F0)

val Outline = Color(0xFF5E6F5C)
val OutlineVariant = Color(0xFFDDE5D8)
val SurfaceTint = Color(0xFF1D6517)

val Error = Color(0xFFA23726)
val ErrorContainer = Color(0xFFF8E2DD)
val OnError = Color(0xFFFFFFFF)
val OnErrorContainer = Color(0xFF8E2A1C)

// Bevel edges: the light from the top left, the shade bottom right
val BevelLight = Color(0xF2FFFFFF)
val BevelShade = Color(0x24054204)

// The panel for anything a phone says (pale lime, like the dashboard's banner)
val Lcd = Color(0xFFEEF5E2)
val LcdInk = Color(0xFF1B3A1A)
