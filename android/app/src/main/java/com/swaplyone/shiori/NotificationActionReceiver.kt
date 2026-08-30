package com.swaplyone.shiori

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

class NotificationActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_TASK_ACCEPT = "com.swaplyone.shiori.ACTION_TASK_ACCEPT"
        const val ACTION_TASK_REJECT = "com.swaplyone.shiori.ACTION_TASK_REJECT"
        const val EXTRA_TASK_ID = "extra_task_id"
        const val EXTRA_NOTIF_ID = "extra_notif_id"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return

        if (action == ACTION_TASK_ACCEPT || action == ACTION_TASK_REJECT) {
            val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
            val notifId = intent.getIntExtra(EXTRA_NOTIF_ID, 2001)
            val subPath = if (action == ACTION_TASK_ACCEPT) "accept" else "reject"

            // Dismiss the assignment notification
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(notifId)

            // Send async background API request
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val prefs = context.getSharedPreferences("shiori_prefs", Context.MODE_PRIVATE)
                    val serverUrl = prefs.getString("server_url", "https://shiori.swaplyone.in")
                    val token = prefs.getString("auth_token", "")

                    val url = URL("$serverUrl/api/tasks/$taskId/$subPath")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    if (!token.isNullOrEmpty()) {
                        conn.setRequestProperty("Authorization", "Bearer $token")
                    }
                    conn.connectTimeout = 4000
                    conn.readTimeout = 4000
                    conn.responseCode
                    conn.disconnect()
                } catch (_: Exception) {}
            }
            return
        }

        val serviceIntent = Intent(context, FocusTimerService::class.java).apply {
            this.action = action
        }
        context.startService(serviceIntent)
    }
}
