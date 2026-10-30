package org.projecteden.farmermobile.ui.screens.ai

import org.projecteden.farmermobile.theme.NeoShapes

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.projecteden.farmermobile.EdenFarmerApp
import org.projecteden.farmermobile.data.local.AuthState
import org.projecteden.farmermobile.data.remote.RemoteFarmerQuestion
import org.projecteden.farmermobile.theme.OnSurface
import org.projecteden.farmermobile.theme.OnSurfaceVariant
import org.projecteden.farmermobile.theme.OutlineVariant
import org.projecteden.farmermobile.theme.Primary
import org.projecteden.farmermobile.theme.PrimaryFixed
import org.projecteden.farmermobile.theme.Secondary
import org.projecteden.farmermobile.theme.SecondaryContainer
import org.projecteden.farmermobile.theme.SurfaceContainerLowest
import org.projecteden.farmermobile.theme.Tertiary
import org.projecteden.farmermobile.theme.TertiaryFixed

/**
 * Ask your agriculture officer. The advice calls are one way, so a farmer's question goes to their SAAO
 * (POST /api/v1/farmer/questions); the officer checks the engine's draft and the answer comes back as a phone call.
 * The farmer sees each question's status here: with the officer, answered (a call is coming), or called.
 */
class AskOfficerViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as EdenFarmerApp
    val authState: StateFlow<AuthState> = app.authManager.authState

    private val _questions = MutableStateFlow<List<RemoteFarmerQuestion>>(emptyList())
    val questions: StateFlow<List<RemoteFarmerQuestion>> = _questions.asStateFlow()

    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun updateDraft(value: String) {
        _draft.value = value.take(300)
    }

    fun refresh() {
        val token = app.authManager.token ?: run { _questions.value = emptyList(); return }
        viewModelScope.launch {
            app.apiClient.myQuestions(token).onSuccess { _questions.value = it }
        }
    }

    fun send() {
        val text = _draft.value.trim()
        if (text.isBlank() || _sending.value) return
        val token = app.authManager.token
        if (token == null) {
            _message.value = "প্রশ্ন পাঠাতে আগে প্রবেশ করুন।"
            return
        }
        viewModelScope.launch {
            _sending.value = true
            app.apiClient.askOfficer(token, text)
                .onSuccess {
                    _draft.value = ""
                    _message.value = "প্রশ্নটি আপনার কৃষি কর্মকর্তার কাছে গেছে। উত্তর ঠিক হলে ফোনে কল আসবে।"
                    refresh()
                }
                .onFailure { _message.value = "পাঠানো যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।" }
            _sending.value = false
        }
    }
}

@Composable
fun AskOfficerCard(
    onSignIn: () -> Unit,
    viewModel: AskOfficerViewModel = viewModel()
) {
    val authState by viewModel.authState.collectAsStateWithLifecycle()
    val questions by viewModel.questions.collectAsStateWithLifecycle()
    val draft by viewModel.draft.collectAsStateWithLifecycle()
    val sending by viewModel.sending.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val signedIn = authState is AuthState.Authenticated

    LaunchedEffect(authState) { viewModel.refresh() }

    Surface(
        color = SurfaceContainerLowest,
        shape = NeoShapes.card,
        border = androidx.compose.foundation.BorderStroke(1.dp, OutlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    modifier = Modifier.size(44.dp).clip(CircleShape).background(TertiaryFixed),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.PhoneInTalk, contentDescription = null, tint = Tertiary, modifier = Modifier.size(24.dp))
                }
                Column {
                    Text("কৃষি কর্মকর্তাকে প্রশ্ন করুন", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = OnSurface)
                    Text(
                        "উপসহকারী কৃষি কর্মকর্তা উত্তর দেখে দেবেন, আর উত্তরটি আপনার ফোনে কল হয়ে আসবে।",
                        style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant, lineHeight = 17.sp
                    )
                }
            }
            if (!signedIn) {
                TextButton(onClick = onSignIn) { Text("প্রশ্ন পাঠাতে প্রবেশ করুন", color = Primary, fontWeight = FontWeight.SemiBold) }
            } else {
                OutlinedTextField(
                    value = draft,
                    onValueChange = viewModel::updateDraft,
                    placeholder = { Text("যেমন: বোরোর বীজতলা কবে দেব?") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = viewModel::send,
                    enabled = draft.isNotBlank() && !sending,
                    shape = NeoShapes.card,
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) { Text(if (sending) "পাঠানো হচ্ছে…" else "কর্মকর্তার কাছে পাঠান") }
            }
            message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Primary) }
            if (signedIn && questions.isNotEmpty()) {
                Text("আপনার প্রশ্ন", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = OnSurfaceVariant)
                questions.take(5).forEach { q -> QuestionRow(q) }
            }
        }
    }
}

@Composable
private fun QuestionRow(q: RemoteFarmerQuestion) {
    val (label, bg, fg) = when (q.status) {
        "called" -> Triple("কলে উত্তর দেওয়া হয়েছে", PrimaryFixed, Primary)
        "answered" -> Triple("উত্তর তৈরি: কল আসবে", TertiaryFixed, Tertiary)
        else -> Triple("কর্মকর্তা দেখছেন", SecondaryContainer, Secondary)
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(NeoShapes.md)
            .background(SurfaceContainerLowest)
            .padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = fg,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clip(NeoShapes.md).background(bg).padding(horizontal = 8.dp, vertical = 2.dp)
        )
        Text(q.textBangla, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = OnSurface)
        q.answerBangla?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant, lineHeight = 17.sp) }
    }
}
