package org.projecteden.farmermobile

import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import org.projecteden.farmermobile.theme.Surface
import org.projecteden.farmermobile.ui.components.EdenBottomNavBar
import org.projecteden.farmermobile.ui.components.EdenTab
import org.projecteden.farmermobile.ui.components.RonguPrefs
import org.projecteden.farmermobile.ui.components.RonguTourCard
import org.projecteden.farmermobile.ui.components.RonguTourScrim
import org.projecteden.farmermobile.ui.components.RonguTourSteps
import org.projecteden.farmermobile.ui.screens.today.RonguGreetingState
import org.projecteden.farmermobile.ui.screens.ai.AiAssistantScreen
import org.projecteden.farmermobile.ui.screens.cropplan.CropPlanScreen
import org.projecteden.farmermobile.ui.screens.erosion.RiverErosionScreen
import org.projecteden.farmermobile.ui.screens.history.AdviceHistoryScreen
import org.projecteden.farmermobile.ui.screens.myfarm.MyFarmScreen
import org.projecteden.farmermobile.ui.screens.rotationdetail.RotationDetailScreen
import org.projecteden.farmermobile.ui.screens.today.TodayAdviceScreen
import org.projecteden.farmermobile.ui.screens.weather.WeatherScreen

@Composable
fun MainNavigation() {
    val backStack = rememberNavBackStack(MainNavKey)

    NavDisplay(
        backStack = backStack,
        onBack = {
            if (backStack.size > 1) {
                backStack.removeLastOrNull()
            }
        },
        entryProvider = entryProvider {
            entry<MainNavKey> {
                EdenMainScaffold(
                    onNavigateToDetail = {
                        Log.i("EDEN_APP", "rotation_detail_opened")
                        backStack.add(RotationDetailNavKey)
                    },
                    onNavigateToPlan = {
                        Log.i("EDEN_APP", "crop_plan_opened")
                        backStack.add(CropPlanNavKey)
                    },
                    onNavigateToHistory = {
                        Log.i("EDEN_APP", "advice_history_opened")
                        backStack.add(AdviceHistoryNavKey)
                    }
                )
            }
            entry<RotationDetailNavKey> {
                RotationDetailScreen(
                    onBack = {
                        backStack.removeLastOrNull()
                    }
                )
            }
            entry<CropPlanNavKey> {
                CropPlanScreen(
                    onBack = {
                        backStack.removeLastOrNull()
                    },
                    onNavigateToDetail = {
                        backStack.add(RotationDetailNavKey)
                    }
                )
            }
            entry<AdviceHistoryNavKey> {
                AdviceHistoryScreen(
                    onBack = {
                        backStack.removeLastOrNull()
                    },
                    onNavigateToDetail = {
                        backStack.add(RotationDetailNavKey)
                    }
                )
            }
        }
    )
}

@Composable
fun EdenMainScaffold(
    onNavigateToDetail: () -> Unit,
    onNavigateToPlan: () -> Unit,
    onNavigateToHistory: () -> Unit
) {
    var selectedTab by rememberSaveable { mutableStateOf(EdenTab.TODAY) }
    val context = LocalContext.current
    val ronguGreeting = remember { RonguGreetingState(tourDone = RonguPrefs.tourDone(context)) }
    // Rongu's tour of the five tabs: the stop he is at, or -1
    var tourStep by rememberSaveable { mutableIntStateOf(-1) }
    val endTour = {
        tourStep = -1
        selectedTab = EdenTab.TODAY
        RonguPrefs.setTourDone(context)
        ronguGreeting.afterTour()
    }
    LaunchedEffect(tourStep) {
        RonguTourSteps.getOrNull(tourStep)?.let { selectedTab = it.tab }
    }
    BackHandler(enabled = tourStep >= 0) { endTour() }

    Scaffold(
        containerColor = Surface,
        bottomBar = {
            EdenBottomNavBar(
                selectedTab = selectedTab,
                onTabSelected = { tab ->
                    Log.i("EDEN_APP", "tab_selected:${tab.name.lowercase()}")
                    selectedTab = tab
                }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (selectedTab) {
                EdenTab.TODAY -> {
                    TodayAdviceScreen(
                        onNavigateToPlan = onNavigateToPlan,
                        onNavigateToHistory = onNavigateToHistory,
                        onNavigateToDetail = onNavigateToDetail,
                        onNavigateToProfile = { selectedTab = EdenTab.FARM },
                        rongu = ronguGreeting.takeIf { tourStep < 0 },
                        onStartTour = {
                            Log.i("EDEN_APP", "rongu_tour_started")
                            tourStep = 0
                        }
                    )
                }
                EdenTab.WEATHER -> {
                    WeatherScreen(
                        onNavigateToProfile = { selectedTab = EdenTab.FARM }
                    )
                }
                EdenTab.EROSION -> {
                    RiverErosionScreen(
                        onNavigateToProfile = { selectedTab = EdenTab.FARM }
                    )
                }
                EdenTab.AI -> {
                    AiAssistantScreen(
                        onNavigateToProfile = { selectedTab = EdenTab.FARM }
                    )
                }
                EdenTab.FARM -> {
                    MyFarmScreen()
                }
            }
            if (tourStep >= 0) {
                RonguTourScrim(Modifier.matchParentSize())
                RonguTourCard(
                    step = tourStep,
                    onNext = { if (tourStep < RonguTourSteps.lastIndex) tourStep += 1 else endTour() },
                    onSkip = endTour,
                    modifier = Modifier.align(Alignment.BottomCenter)
                )
            }
        }
    }
}
