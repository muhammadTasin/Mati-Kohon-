package org.projecteden.farmermobile.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import org.projecteden.farmermobile.R
import org.projecteden.farmermobile.theme.OutlineVariant

/**
 * Real photos of the crops (res/drawable-nodpi/crop_*.jpg): openly licensed Wikimedia Commons pictures of Bangladeshi
 * fields, the same as the dashboard's (apps/saao-dashboard/public/img/credits.json); the credits are on My farm.
 */
@DrawableRes
fun cropPhotoRes(cropBangla: String): Int? = when {
    "বোরো" in cropBangla -> R.drawable.crop_boro
    "আমন" in cropBangla || "আউশ" in cropBangla || "ধান" in cropBangla -> R.drawable.crop_aman
    "মসুর" in cropBangla -> R.drawable.crop_lentil
    "সরিষা" in cropBangla -> R.drawable.crop_mustard
    "গম" in cropBangla -> R.drawable.crop_wheat
    "ভুট্টা" in cropBangla -> R.drawable.crop_maize
    "সূর্যমুখী" in cropBangla -> R.drawable.crop_sunflower
    "পাট" in cropBangla -> R.drawable.crop_jute
    "আলু" in cropBangla -> R.drawable.crop_potato
    else -> null
}

/** The crop's photo as a small square, or nothing for a crop with no photo. */
@Composable
fun CropPhoto(cropBangla: String, modifier: Modifier = Modifier, size: Dp = 48.dp) {
    val res = cropPhotoRes(cropBangla) ?: return
    Image(
        painter = painterResource(res),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(2.dp))
            .border(1.dp, OutlineVariant, RoundedCornerShape(2.dp))
    )
}

/** Who took each photo, for the credits on My farm (author, licence). */
val PHOTO_CREDITS: List<Pair<String, String>> = listOf(
    "মাঠে কৃষক, ব্রি রাজশাহী" to "Tahmid Reza · CC BY-SA 4.0",
    "ধান ঘরে তোলা" to "Zaheed Sarwer Khan · CC BY 4.0",
    "আমন ধান" to "A S M Jobaer · CC BY-SA 4.0",
    "বোরোর বীজতলা" to "MdRamjanAliWiki · CC BY 4.0",
    "মসুর" to "ChriKo · CC BY-SA 3.0",
    "সরিষা" to "Nafiur Rahman · CC BY-SA 4.0",
    "গম" to "Tanvir Rahat · CC BY-SA 4.0",
    "আলু" to "কুউ পুলক · CC BY-SA 4.0",
    "ভুট্টা" to "Afifa Afrin · CC BY-SA 4.0",
    "সূর্যমুখী" to "Muhammad Amdad Hossain · CC BY-SA 4.0",
    "পাট" to "Afifa Afrin · CC BY-SA 3.0",
)
