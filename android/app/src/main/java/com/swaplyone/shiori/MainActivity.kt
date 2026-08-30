package com.swaplyone.shiori

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        setContent {
            ShioriTheme {
                ShioriFocusScreen(
                    onStart = { taskTitle, projectName, mins ->
                        val intent = Intent(this, FocusTimerService::class.java).apply {
                            action = FocusTimerService.ACTION_START
                            putExtra(FocusTimerService.EXTRA_TASK_TITLE, taskTitle)
                            putExtra(FocusTimerService.EXTRA_PROJECT_NAME, projectName)
                            putExtra(FocusTimerService.EXTRA_DURATION_MINUTES, mins)
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            startForegroundService(intent)
                        } else {
                            startService(intent)
                        }
                    },
                    onPause = {
                        val intent = Intent(this, FocusTimerService::class.java).apply {
                            action = FocusTimerService.ACTION_PAUSE
                        }
                        startService(intent)
                    },
                    onResume = {
                        val intent = Intent(this, FocusTimerService::class.java).apply {
                            action = FocusTimerService.ACTION_RESUME
                        }
                        startService(intent)
                    },
                    onStop = {
                        val intent = Intent(this, FocusTimerService::class.java).apply {
                            action = FocusTimerService.ACTION_STOP
                        }
                        startService(intent)
                    }
                )
            }
        }
    }
}

@Composable
fun ShioriTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            background = Color(0xFFF5F2EC),
            surface = Color.White,
            primary = Color.Black,
            onPrimary = Color.White
        ),
        content = content
    )
}

@Composable
fun ShioriFocusScreen(
    onStart: (String, String, Int) -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit
) {
    var isRunning by remember { mutableStateOf(FocusTimerService.isRunning) }
    var isPaused by remember { mutableStateOf(FocusTimerService.isPaused) }
    var secondsRemaining by remember { mutableStateOf(FocusTimerService.currentSecondsRemaining) }
    var selectedMinutes by remember { mutableIntStateOf(25) }
    var taskTitle by remember { mutableStateOf(FocusTimerService.currentTaskTitle) }

    // Sync UI state periodically with service
    LaunchedEffect(Unit) {
        while (true) {
            isRunning = FocusTimerService.isRunning
            isPaused = FocusTimerService.isPaused
            if (isRunning) {
                secondsRemaining = FocusTimerService.currentSecondsRemaining
                taskTitle = FocusTimerService.currentTaskTitle
            } else {
                secondsRemaining = selectedMinutes.toLong() * 60
            }
            delay(500)
        }
    }

    val minutePresets = listOf(5, 10, 15, 25, 45, 60)

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFFF5F2EC)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(Color.Black)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "SHIORI",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 2.sp,
                        color = Color.Black
                    )
                }

                Text(
                    text = "ANDROID COMPANION",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = Color.Gray
                )
            }

            // Main Focus Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(2.dp, Color.Black, RoundedCornerShape(8.dp)),
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .background(if (isPaused) Color.LightGray else Color.Black, RoundedCornerShape(3.dp))
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = if (isPaused) "FOCUS PAUSED" else if (isRunning) "FOCUS MODE" else "FOCUS SESSION",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = if (isPaused) Color.Black else Color.White
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    val mins = secondsRemaining / 60
                    val secs = secondsRemaining % 60
                    Text(
                        text = String.format("%02d:%02d", mins, secs),
                        fontSize = 58.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        color = Color.Black
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = taskTitle,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                        color = Color.Black.copy(alpha = 0.85f)
                    )

                    if (isRunning) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .background(if (isPaused) Color(0xFFE65100) else Color(0xFF2E7D32), RoundedCornerShape(4.dp))
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (isPaused) "Paused on Lock Screen" else "Live on Lock Screen & Status Bar",
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                color = Color.Gray
                            )
                        }
                    }
                }
            }

            // Duration Selection (When idle)
            if (!isRunning) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "DURATION PRESETS",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = Color.Gray,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        minutePresets.forEach { mins ->
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .background(
                                        if (selectedMinutes == mins) Color.Black else Color.White,
                                        RoundedCornerShape(4.dp)
                                    )
                                    .border(1.dp, Color.Black, RoundedCornerShape(4.dp))
                                    .clickable {
                                        selectedMinutes = mins
                                        secondsRemaining = mins.toLong() * 60
                                    }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "${mins}m",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = if (selectedMinutes == mins) Color.White else Color.Black
                                )
                            }
                        }
                    }
                }
            }

            // Bottom Action Controls
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (!isRunning) {
                    Button(
                        onClick = {
                            onStart(taskTitle, "SHIORI", selectedMinutes)
                            isRunning = true
                            isPaused = false
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Black),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "START FOCUS & LOCK SCREEN TIMER",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = Color.White
                        )
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (isPaused) {
                            Button(
                                onClick = {
                                    onResume()
                                    isPaused = false
                                },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(50.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color.Black),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = "RESUME",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = Color.White
                                )
                            }
                        } else {
                            OutlinedButton(
                                onClick = {
                                    onPause()
                                    isPaused = true
                                },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(50.dp),
                                border = androidx.compose.foundation.BorderStroke(1.5.dp, Color.Black),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = "PAUSE",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = Color.Black
                                )
                            }
                        }

                        OutlinedButton(
                            onClick = {
                                onStop()
                                isRunning = false
                                isPaused = false
                            },
                            modifier = Modifier
                                .weight(1f)
                                .height(50.dp),
                            border = androidx.compose.foundation.BorderStroke(1.5.dp, Color.Red),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                text = "STOP",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = Color.Red
                            )
                        }
                    }
                }
            }
        }
    }
}
