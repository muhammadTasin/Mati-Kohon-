package org.projecteden.farmermobile.ui.components

import android.content.Context
import android.graphics.ImageDecoder
import android.graphics.drawable.Animatable2
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.provider.Settings
import android.widget.ImageView
import androidx.annotation.RequiresApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.projecteden.farmermobile.R
import org.projecteden.farmermobile.theme.Lcd
import org.projecteden.farmermobile.theme.LcdInk
import org.projecteden.farmermobile.theme.Primary
import org.projecteden.farmermobile.theme.PrimaryFixedDim
import kotlin.math.ceil
import kotlin.math.min

/**
 * Rongu's pre-rendered loops in assets/rongu: 3 s each at 24 fps, made from the dashboard's 3D model by
 * tools/rongu-loops. (Assets, not res/raw: a raw resource would be scaled up to the screen's density when decoded.)
 */
enum class RonguMove(val asset: String) {
    Idle("rongu/idle.webp"),
    Wave("rongu/wave.webp"),
    Talk("rongu/talk.webp"),
    Point("rongu/point.webp")
}

/** Width over height of every loop (241 x 360 px). */
const val RonguAspect = 241f / 360f

private const val RonguDescription = "রঙ্গু, মাটি কহনের সঙ্গী"

/** Talking loops for a line, as long as the dashboard gives him to say it (0.9 s plus a second per 15 letters, at most 9 s). */
fun talkFor(text: String): List<RonguMove> {
    val seconds = min(9.0, 0.9 + text.length / 15.0)
    return List(ceil(seconds / 3.0).toInt()) { RonguMove.Talk }
}

/**
 * Rongu (রঙ্গু), the Mati Kohon companion. Plays [moves] once each, in order, then [rest] [restLoops] times, and
 * then stands still (a phone redrawing him forever would spend its battery on it); [onMovesDone] runs when the
 * last move ends. Every loop starts and ends in the same pose, so one follows another without a jump. A new [cue]
 * plays the moves again (a new line to say). The size follows the height.
 * Before Android 9, and when the phone's animations are turned off, he stands still.
 */
@Composable
fun RonguView(
    modifier: Modifier = Modifier,
    moves: List<RonguMove> = emptyList(),
    rest: RonguMove = RonguMove.Idle,
    restLoops: Int = 4,
    cue: Any? = Unit,
    onMovesDone: () -> Unit = {}
) {
    val context = LocalContext.current
    val sized = modifier
        .aspectRatio(RonguAspect, matchHeightConstraintsFirst = true)
        .semantics { contentDescription = RonguDescription }
    val still = remember { Build.VERSION.SDK_INT < Build.VERSION_CODES.P || animationsOff(context) }
    if (still) {
        Image(
            painter = painterResource(R.drawable.rongu_still),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = sized
        )
    } else {
        RonguLoops(sized, moves, rest, restLoops, cue, onMovesDone)
    }
}

private fun animationsOff(context: Context): Boolean =
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

private class Clip(val drawable: AnimatedImageDrawable, val once: Boolean)

private const val StartDelayMs = 900L

@RequiresApi(Build.VERSION_CODES.P)
@Composable
private fun RonguLoops(
    modifier: Modifier,
    moves: List<RonguMove>,
    rest: RonguMove,
    restLoops: Int,
    cue: Any?,
    onMovesDone: () -> Unit
) {
    val context = LocalContext.current
    val movesDone by rememberUpdatedState(onMovesDone)
    var step by remember(cue) { mutableIntStateOf(0) }
    val once = step < moves.size
    val move = if (once) moves[step] else rest

    // He appears standing (the still) and starts moving a beat later, once the screen around him has settled.
    // The next loop is decoded off the main thread; the one before stays on screen until it is ready.
    var settled by remember { mutableStateOf(false) }
    val clip by produceState<Clip?>(null, cue, step) {
        if (!settled) {
            delay(StartDelayMs)
            settled = true
        }
        val drawable = withContext(Dispatchers.IO) {
            ImageDecoder.decodeDrawable(ImageDecoder.createSource(context.assets, move.asset))
        } as? AnimatedImageDrawable
        value = drawable?.let { Clip(it, once) }
    }

    DisposableEffect(clip) {
        val current = clip ?: return@DisposableEffect onDispose {}
        val drawable = current.drawable
        // a move plays once; the rest loop repeats restLoops times, then holds its last frame (his resting pose)
        drawable.repeatCount = if (current.once) 0 else (restLoops - 1).coerceAtLeast(0)
        val callback = object : Animatable2.AnimationCallback() {
            override fun onAnimationEnd(drawable: Drawable?) {
                if (!current.once) return
                step += 1
                if (step == moves.size) movesDone()
            }
        }
        drawable.registerAnimationCallback(callback)
        drawable.start()
        onDispose {
            drawable.unregisterAnimationCallback(callback)
            drawable.stop()
        }
    }

    AndroidView(
        factory = { viewContext ->
            ImageView(viewContext).apply {
                scaleType = ImageView.ScaleType.FIT_CENTER
                // every loop's first frame: shown while the first loop is decoded
                setImageResource(R.drawable.rongu_still)
            }
        },
        update = { view ->
            val drawable = clip?.drawable
            if (drawable != null && view.drawable !== drawable) {
                drawable.isFilterBitmap = true
                view.setImageDrawable(drawable)
            }
        },
        modifier = modifier
    )
}

/** A speech bubble whose tail points left, to Rongu's face: the soft-teal panel the app uses for anything said. */
class SpeechBubbleShape(
    private val tailFromTop: Dp = 30.dp,
    private val tail: Dp = 9.dp,
    private val corner: Dp = 16.dp
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val t = with(density) { tail.toPx() }
        val y = with(density) { tailFromTop.toPx() }.coerceIn(t * 2, size.height - t * 2)
        val r = with(density) { corner.toPx() }
        val body = Path().apply { addRoundRect(RoundRect(t, 0f, size.width, size.height, CornerRadius(r))) }
        val point = Path().apply {
            moveTo(t + 2f, y - t)
            lineTo(0f, y + t * 0.3f)
            lineTo(t + 2f, y + t)
            close()
        }
        return Outline.Generic(Path.combine(PathOperation.Union, body, point))
    }
}

/** What Rongu says, in a bubble with his name on top. */
@Composable
fun RonguSpeech(text: String, modifier: Modifier = Modifier) {
    val shape = remember { SpeechBubbleShape() }
    Column(
        modifier = modifier
            .clip(shape)
            .background(Lcd)
            .border(1.dp, PrimaryFixedDim, shape)
            .padding(start = 21.dp, end = 12.dp, top = 8.dp, bottom = 10.dp)
    ) {
        Text(
            text = "রঙ্গু",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = Primary
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = LcdInk,
            lineHeight = 21.sp
        )
    }
}
