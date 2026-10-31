package org.projecteden.farmermobile.ui.screens.today

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.projecteden.farmermobile.R
import org.projecteden.farmermobile.theme.NeoShapes
import org.projecteden.farmermobile.theme.OnPrimary
import org.projecteden.farmermobile.theme.OutlineControl
import org.projecteden.farmermobile.theme.Primary
import org.projecteden.farmermobile.theme.SurfaceContainerLowest
import org.projecteden.farmermobile.theme.neoRaised
import org.projecteden.farmermobile.ui.components.RonguAspect
import org.projecteden.farmermobile.ui.components.RonguMove
import org.projecteden.farmermobile.ui.components.RonguSpeech
import org.projecteden.farmermobile.ui.components.RonguView
import org.projecteden.farmermobile.ui.components.talkFor

private const val Hello = "আসসালামু আলাইকুম! আমি রঙ্গু, মাটি কহনের সঙ্গী।"
private const val Invite = "$Hello প্রথমবার এলেন? চলুন, অ্যাপটা এক পাক ঘুরে দেখাই।"

// narrower than Material's 24 dp, so both buttons and the fold arrow fit in one row on a phone
private val ButtonPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)

/** What Rongu says on Today, one line at a time (tap him for the next). */
private val RonguLines = listOf(
    "$Hello গিরগিটির মতো আমার এক চোখ আকাশে, এক চোখ মাটিতে।",
    "নাসার স্যাটেলাইট দেখে বলি, আপনার জমিতে কোন ফসলে পানি বাঁচে।",
    "নিচে আজকের পরামর্শ। “বাংলা অডিও গাইড” চাপলে পুরোটা শুনতেও পারবেন।",
    "কোনো প্রশ্ন? “সহায়ক AI” পাতায় লিখুন, অথবা আপনার উপসহকারী কৃষি কর্মকর্তাকে জিজ্ঞেস করুন।"
)

/**
 * Rongu's greeting on Today. The main screen keeps it, so he waves hello once per visit to the app
 * rather than on every tab switch, and remembers the line he was on.
 */
@Stable
class RonguGreetingState(tourDone: Boolean) {
    var tourDone by mutableStateOf(tourDone)
    var line by mutableIntStateOf(0)
        private set
    var said by mutableIntStateOf(0) // a new value makes him say the line (again)
        private set
    var greeted by mutableStateOf(false)
    var folded by mutableStateOf(false)

    val text: String get() = if (line == 0 && !tourDone) Invite else RonguLines[line]

    fun sayNext() = say((line + 1) % RonguLines.size)

    fun say(index: Int) {
        line = index
        said += 1
        greeted = true // past hello: no second wave
    }

    /** Back on Today after the tour: where to ask questions. */
    fun afterTour() {
        tourDone = true
        folded = false
        say(RonguLines.lastIndex)
    }
}

@Composable
fun RonguGreetingCard(
    state: RonguGreetingState,
    onStartTour: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (state.folded) {
        RonguFolded(onOpen = { state.folded = false; state.say(state.line) }, modifier = modifier)
        return
    }
    Surface(
        color = SurfaceContainerLowest,
        shape = NeoShapes.card,
        modifier = modifier.fillMaxWidth().neoRaised()
    ) {
        Row(
            modifier = Modifier.padding(start = 2.dp, end = 10.dp, top = 10.dp, bottom = 6.dp),
            verticalAlignment = Alignment.Top
        ) {
            RonguView(
                modifier = Modifier
                    .height(156.dp)
                    .clickable(onClickLabel = "আরও বলো") { state.sayNext() },
                moves = (if (state.greeted) emptyList() else listOf(RonguMove.Wave)) + talkFor(state.text),
                cue = state.said,
                onMovesDone = { state.greeted = true }
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                RonguSpeech(state.text, modifier = Modifier.fillMaxWidth())
                // one row on a phone; a narrower screen moves the fold arrow to a second row
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    itemVerticalAlignment = Alignment.CenterVertically
                ) {
                    if (state.tourDone) {
                        OutlinedButton(
                            onClick = onStartTour,
                            shape = NeoShapes.pill,
                            border = BorderStroke(1.dp, OutlineControl),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary),
                            contentPadding = ButtonPadding,
                            modifier = Modifier.heightIn(min = 48.dp)
                        ) {
                            Text("ঘুরে দেখাও", fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        Button(
                            onClick = onStartTour,
                            shape = NeoShapes.pill,
                            colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = OnPrimary),
                            contentPadding = ButtonPadding,
                            modifier = Modifier.heightIn(min = 48.dp)
                        ) {
                            Text("চলুন, দেখি", fontWeight = FontWeight.SemiBold)
                        }
                    }
                    TextButton(
                        onClick = { state.sayNext() },
                        shape = NeoShapes.pill,
                        contentPadding = ButtonPadding,
                        modifier = Modifier.heightIn(min = 48.dp)
                    ) {
                        Text("আরও বলো", color = Primary, fontWeight = FontWeight.SemiBold)
                    }
                    IconButton(onClick = { state.folded = true }) {
                        Icon(Icons.Default.ExpandLess, contentDescription = "রঙ্গুকে ছোট করুন", tint = Primary)
                    }
                }
            }
        }
    }
}

/** Rongu tucked away: a small row to bring him back. */
@Composable
private fun RonguFolded(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        color = SurfaceContainerLowest,
        shape = NeoShapes.card,
        modifier = modifier
            .fillMaxWidth()
            .neoRaised()
            .clickable(onClickLabel = "রঙ্গুকে খুলুন", onClick = onOpen)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Image(
                painter = painterResource(R.drawable.rongu_still),
                contentDescription = null,
                modifier = Modifier.height(52.dp).aspectRatio(RonguAspect)
            )
            Text(
                text = "রঙ্গুর কথা শুনুন",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = Primary,
                modifier = Modifier.weight(1f)
            )
            Icon(Icons.Default.ExpandMore, contentDescription = null, tint = Primary, modifier = Modifier.size(24.dp))
        }
    }
}
