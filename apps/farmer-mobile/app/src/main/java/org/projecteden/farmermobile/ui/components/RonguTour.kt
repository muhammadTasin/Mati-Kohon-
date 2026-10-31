package org.projecteden.farmermobile.ui.components

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.projecteden.farmermobile.theme.NeoShapes
import org.projecteden.farmermobile.theme.OnPrimary
import org.projecteden.farmermobile.theme.OnSurface
import org.projecteden.farmermobile.theme.Primary
import org.projecteden.farmermobile.theme.Secondary
import org.projecteden.farmermobile.theme.SurfaceContainerLowest
import org.projecteden.farmermobile.theme.neoRaised

/** One stop of Rongu's tour: the tab he opens and what he says there (from the dashboard's farmer tour). */
data class RonguTourStep(val tab: EdenTab, val text: String)

val RonguTourSteps = listOf(
    RonguTourStep(
        EdenTab.TODAY,
        "এটা আপনার আজকের পাতা: জমির ফসল চক্র আর আজকের পরামর্শ। “বাংলা অডিও গাইড” চাপলে পরামর্শটা শুনতেও পারবেন।"
    ),
    RonguTourStep(
        EdenTab.WEATHER,
        "জেলা আর উপজেলা বেছে নিলে আগামী ৭ দিনের আবহাওয়া, নাসার তথ্য আর গরুর তাপ চাপ দেখা যায়।"
    ),
    RonguTourStep(
        EdenTab.EROSION,
        "জমি নদীর পাশে? এখানে নদীভাঙন আর নদীর পানির উচ্চতা দেখুন (বাপাউবো ও সিইজিআইএস)।"
    ),
    RonguTourStep(
        EdenTab.AI,
        "কোন ফসল চান লিখুন, যেমন “শুধু গম, ধান না”, পরিকল্পনা পেয়ে যাবেন। অন্য প্রশ্ন যায় আপনার উপসহকারী কৃষি কর্মকর্তার কাছে, আর উত্তর আসে ফোন কলে।"
    ),
    RonguTourStep(
        EdenTab.FARM,
        "এখানে আপনার খামার আর জমির বিবরণ: জমির শ্রেণি, মাটি, সেচ। আপনার তথ্য কী কাজে লাগে, তাও লেখা আছে।"
    )
)

/** Whether the farmer has taken (or skipped) the tour; until then Rongu offers it in his greeting. */
object RonguPrefs {
    private const val FILE = "rongu_companion"
    private const val TOUR_DONE = "tour_done"

    fun tourDone(context: Context): Boolean =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(TOUR_DONE, false)

    fun setTourDone(context: Context) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean(TOUR_DONE, true).apply()
    }
}

/** Dims the screen during the tour; the tab bar below stays bright, like the dashboard's spotlight. */
@Composable
fun RonguTourScrim(modifier: Modifier = Modifier) {
    Box(modifier = modifier.background(OnSurface.copy(alpha = 0.34f)))
}

/**
 * The tour card over the bottom of the screen: Rongu points, then says what the tab is for. The card's
 * tail sits over the tab in the bar below, which the tour has opened.
 */
@Composable
fun RonguTourCard(
    step: Int,
    onNext: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier
) {
    val stop = RonguTourSteps[step]
    val last = step == RonguTourSteps.lastIndex
    Column(modifier = modifier.fillMaxWidth()) {
        Surface(
            color = SurfaceContainerLowest,
            shape = NeoShapes.xl,
            modifier = Modifier.padding(horizontal = 12.dp).fillMaxWidth().neoRaised(NeoShapes.xl)
        ) {
            Row(
                modifier = Modifier.padding(start = 6.dp, end = 12.dp, top = 12.dp, bottom = 8.dp),
                verticalAlignment = Alignment.Top
            ) {
                RonguView(
                    modifier = Modifier.height(132.dp),
                    moves = listOf(RonguMove.Point) + talkFor(stop.text),
                    cue = step
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "${(step + 1).toBanglaDigits()}/${RonguTourSteps.size.toBanglaDigits()} · ${stop.tab.titleBangla}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = Secondary,
                        modifier = Modifier.padding(start = 10.dp)
                    )
                    RonguSpeech(stop.text, modifier = Modifier.fillMaxWidth())
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(
                            onClick = onSkip,
                            shape = NeoShapes.pill,
                            modifier = Modifier.heightIn(min = 48.dp)
                        ) {
                            Text("বাদ দিন", color = Primary, fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(modifier = Modifier.weight(1f))
                        Button(
                            onClick = onNext,
                            shape = NeoShapes.pill,
                            colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = OnPrimary),
                            modifier = Modifier.heightIn(min = 48.dp)
                        ) {
                            Text(if (last) "শেষ" else "পরের", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
        // the card's tail: over the middle of this stop's tab in the bottom bar (its row has 4 dp of padding each side)
        Canvas(modifier = Modifier.fillMaxWidth().height(10.dp)) {
            val inset = 4.dp.toPx()
            val x = inset + (size.width - inset * 2) * (stop.tab.ordinal + 0.5f) / EdenTab.entries.size
            val half = 9.dp.toPx()
            drawPath(
                Path().apply {
                    moveTo(x - half, 0f)
                    lineTo(x, size.height)
                    lineTo(x + half, 0f)
                    close()
                },
                color = SurfaceContainerLowest
            )
        }
    }
}
