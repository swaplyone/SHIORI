package in.swaplyone.shiori

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val serviceIntent = Intent(context, FocusTimerService::class.java).apply {
            this.action = action
        }
        context.startService(serviceIntent)
    }
}
