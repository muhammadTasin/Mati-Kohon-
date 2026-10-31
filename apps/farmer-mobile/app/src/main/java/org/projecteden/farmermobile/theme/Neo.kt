package org.projecteden.farmermobile.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** The radius scale of the design sheet: 4, 8, 12, 16, 24, and a pill. */
object NeoShapes {
    val xs = RoundedCornerShape(4.dp)    // tracks, chips
    val sm = RoundedCornerShape(8.dp)    // fields
    val md = RoundedCornerShape(12.dp)   // list rows, small cards, clips
    val card = RoundedCornerShape(16.dp) // cards
    val xl = RoundedCornerShape(24.dp)   // dialogs, bars
    val pill = RoundedCornerShape(percent = 50) // buttons and badges
    val barBottom = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp)
    val barTop = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
}

/** Buttons and text buttons: the pill. */
val EdenShape = NeoShapes.pill

/** The body colour is the card face; only the shadow layers drawn with it are seen. */
private fun shadowPaint() = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = NeoFace.toArgb() }

private fun Shape.pathFor(size: Size, direction: LayoutDirection, density: Density): Path {
    val path = Path()
    when (val outline = createOutline(size, direction, density)) {
        is Outline.Rectangle -> path.addRect(outline.rect)
        is Outline.Rounded -> path.addRoundRect(outline.roundRect)
        is Outline.Generic -> path.addPath(outline.path)
    }
    return path
}

/**
 * A raised surface, lit from the top left: a warm shade down and to the right, a light glow up and to the left.
 * Draw it behind the surface's own background (the surface covers the body; only the two shadows show).
 */
fun Modifier.neoRaised(shape: Shape = NeoShapes.card, depth: Dp = 5.dp): Modifier = drawBehind {
    val path = shape.pathFor(size, layoutDirection, this)
    val d = depth.toPx()
    drawIntoCanvas { canvas ->
        val native = shadowPaint()
        val outline = path.asAndroidPath()
        native.setShadowLayer(d * 1.7f, d * 0.8f, d, NeoShade.toArgb())
        canvas.nativeCanvas.drawPath(outline, native)
        native.setShadowLayer(d * 1.5f, -d * 0.7f, -d * 0.7f, NeoLight.toArgb())
        canvas.nativeCanvas.drawPath(outline, native)
    }
}

/** A well (fields, tracks): the shade falls from the top and left edge inwards, the light from the bottom and right. */
fun Modifier.neoInset(shape: Shape = NeoShapes.sm, depth: Dp = 3.dp): Modifier = drawWithContent {
    drawContent()
    val path = shape.pathFor(size, layoutDirection, this)
    val d = depth.toPx()
    val ring = Path().apply {
        fillType = PathFillType.EvenOdd
        addRect(Rect(-size.width, -size.height, size.width * 2f, size.height * 2f))
        addPath(path)
    }
    clipPath(path) {
        drawIntoCanvas { canvas ->
            val native = shadowPaint()
            val outline = ring.asAndroidPath()
            native.setShadowLayer(d * 1.6f, d, d, NeoShade.toArgb())
            canvas.nativeCanvas.drawPath(outline, native)
            native.setShadowLayer(d * 1.4f, -d * 0.8f, -d * 0.8f, NeoLight.toArgb())
            canvas.nativeCanvas.drawPath(outline, native)
        }
    }
}

/** The earlier names, kept so every screen keeps compiling: a raised card and a sunk well. */
fun Modifier.bevel(): Modifier = neoRaised()
fun Modifier.sunk(): Modifier = neoInset()
