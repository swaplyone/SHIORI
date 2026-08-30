package com.swaplyone.shiori

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.CountDownTimer
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

class FocusTimerService : Service() {

    companion object {
        const val CHANNEL_ID = "shiori_focus_timer_live_v2"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.swaplyone.shiori.ACTION_START"
        const val ACTION_PAUSE = "com.swaplyone.shiori.ACTION_PAUSE"
        const val ACTION_RESUME = "com.swaplyone.shiori.ACTION_RESUME"
        const val ACTION_STOP = "com.swaplyone.shiori.ACTION_STOP"

        const val EXTRA_TASK_TITLE = "extra_task_title"
        const val EXTRA_PROJECT_NAME = "extra_project_name"
        const val EXTRA_DURATION_MINUTES = "extra_duration_minutes"
        const val EXTRA_SERVER_URL = "extra_server_url"
        const val EXTRA_AUTH_TOKEN = "extra_auth_token"

        var isRunning: Boolean = false
        var isPaused: Boolean = false
        var currentTaskTitle: String = "Focus Session"
        var currentProjectName: String = "SHIORI"
        var currentSecondsRemaining: Long = 25 * 60
        var currentTotalSeconds: Long = 25 * 60
        var currentEndTimeMillis: Long = 0
    }

    private var countDownTimer: CountDownTimer? = null
    private var serverUrl: String = "https://shiori.swaplyone.in"
    private var authToken: String = ""

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_START -> {
                val taskTitle = intent.getStringExtra(EXTRA_TASK_TITLE) ?: "Focus Session"
                val projectName = intent.getStringExtra(EXTRA_PROJECT_NAME) ?: "SHIORI"
                val durationMinutes = intent.getIntExtra(EXTRA_DURATION_MINUTES, 25)
                serverUrl = intent.getStringExtra(EXTRA_SERVER_URL) ?: "https://shiori.swaplyone.in"
                authToken = intent.getStringExtra(EXTRA_AUTH_TOKEN) ?: ""

                startFocusSession(taskTitle, projectName, durationMinutes)
            }
            ACTION_PAUSE -> pauseFocusSession()
            ACTION_RESUME -> resumeFocusSession()
            ACTION_STOP -> stopFocusSession()
        }

        return START_STICKY
    }

    private fun startFocusSession(taskTitle: String, projectName: String, durationMinutes: Int) {
        currentTaskTitle = taskTitle
        currentProjectName = projectName
        currentTotalSeconds = durationMinutes.toLong() * 60
        currentSecondsRemaining = currentTotalSeconds
        currentEndTimeMillis = System.currentTimeMillis() + (currentSecondsRemaining * 1000)
        isRunning = true
        isPaused = false

        startForeground(NOTIFICATION_ID, buildOngoingNotification(isPaused = false))
        startTicker(currentSecondsRemaining * 1000)
        syncBackend("start", durationMinutes)
    }

    private fun pauseFocusSession() {
        if (!isRunning || isPaused) return
        isPaused = true
        countDownTimer?.cancel()

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, buildOngoingNotification(isPaused = true))
        syncBackend("pause", 0)
    }

    private fun resumeFocusSession() {
        if (!isRunning || !isPaused) return
        isPaused = false
        currentEndTimeMillis = System.currentTimeMillis() + (currentSecondsRemaining * 1000)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, buildOngoingNotification(isPaused = false))
        startTicker(currentSecondsRemaining * 1000)
        syncBackend("resume", 0)
    }

    private fun stopFocusSession() {
        isRunning = false
        isPaused = false
        countDownTimer?.cancel()
        syncBackend("stop", 0)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun onSessionCompleted() {
        isRunning = false
        isPaused = false
        countDownTimer?.cancel()
        triggerCompletionHaptic()
        syncBackend("complete", 0)

        // Show completion alert notification
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val completeNotification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shiori)
            .setContentTitle("SHIORI Focus Complete 🔔")
            .setContentText("Focus session complete: $currentTaskTitle")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        stopForeground(STOP_FOREGROUND_REMOVE)
        notificationManager.notify(1002, completeNotification)
        stopSelf()
    }

    private fun startTicker(millis: Long) {
        countDownTimer?.cancel()
        countDownTimer = object : CountDownTimer(millis, 500) {
            override fun onTick(millisUntilFinished: Long) {
                currentSecondsRemaining = millisUntilFinished / 1000
            }

            override fun onFinish() {
                onSessionCompleted()
            }
        }.start()
    }

    private fun buildOngoingNotification(isPaused: Boolean): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val openAppPendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val mins = currentSecondsRemaining / 60
        val secs = currentSecondsRemaining % 60
        val timeFormatted = String.format("%02d:%02d", mins, secs)

        val title = if (isPaused) "⏸ FOCUS PAUSED ($timeFormatted)" else "⏳ FOCUS MODE (Active)"
        val contentText = "$currentTaskTitle • $currentProjectName"

        val bigTextStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText("$currentTaskTitle\nProject: $currentProjectName\nSession: ${currentTotalSeconds / 60}m focus block")

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shiori)
            .setContentTitle(title)
            .setContentText(contentText)
            .setStyle(bigTextStyle)
            .setContentIntent(openAppPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

        if (isPaused) {
            builder.setUsesChronometer(false)

            // Add Resume Action Button
            val resumeIntent = Intent(this, NotificationActionReceiver::class.java).apply {
                action = ACTION_RESUME
            }
            val resumePending = PendingIntent.getBroadcast(
                this, 1, resumeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(R.drawable.ic_play, "▶ RESUME", resumePending)
        } else {
            // Native Android Live Chronometer Countdown
            builder.setUsesChronometer(true)
            builder.setChronometerCountDown(true)
            builder.setWhen(currentEndTimeMillis)

            // Add Pause Action Button
            val pauseIntent = Intent(this, NotificationActionReceiver::class.java).apply {
                action = ACTION_PAUSE
            }
            val pausePending = PendingIntent.getBroadcast(
                this, 2, pauseIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(R.drawable.ic_pause, "⏸ PAUSE", pausePending)
        }

        // Add Stop Action Button
        val stopIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = ACTION_STOP
        }
        val stopPending = PendingIntent.getBroadcast(
            this, 3, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        builder.addAction(R.drawable.ic_stop, "⏹ STOP", stopPending)

        return builder.build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SHIORI Focus Timer",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Live countdown timer with interactive controls on lock screen"
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableVibration(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun triggerCompletionHaptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibratorManager.defaultVibrator.vibrate(
                    VibrationEffect.createWaveform(longArrayOf(0, 300, 150, 300), -1)
                )
            } else {
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                vibrator.vibrate(longArrayOf(0, 300, 150, 300), -1)
            }
        } catch (_: Exception) {}
    }

    private fun syncBackend(action: String, durationMinutes: Int) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("$serverUrl/api/focus/session/$action")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                if (authToken.isNotEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer $authToken")
                }
                if (action == "start") {
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.doOutput = true
                    val jsonBody = """{"taskTitle":"$currentTaskTitle","projectName":"$currentProjectName","durationMinutes":$durationMinutes}"""
                    conn.outputStream.use { it.write(jsonBody.toByteArray()) }
                }
                conn.responseCode
                conn.disconnect()
            } catch (_: Exception) {}
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
