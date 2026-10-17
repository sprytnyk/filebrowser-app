package dev.sprytnyk.transferservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * What a transfers notification shows. `progress` is 0–1000, or -1 while the total is unknown;
 * `icon` is "upload", "download", "uploadDone", "downloadDone" or "error".
 */
data class Status(
  val channelName: String,
  val title: String,
  val text: String,
  val progress: Int,
  val icon: String,
)

/**
 * Keeps the app's process running while transfers go on in the background. Without it Android
 * freezes a backgrounded app within seconds. The transfers themselves stay in JavaScript and
 * expo-file-system: this only holds the ongoing notification, and a partial wake lock so they
 * keep going with the screen off.
 *
 * Everything here runs on the main thread.
 */
class TransferService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // After startForegroundService() Android requires startForeground(), even when the
    // transfers already ended before the service got here.
    try {
      status?.let { enterForeground(it) }
    } catch (e: Exception) {
      Log.w(TAG, "Couldn't enter the foreground", e)
      stopSelf()
      return START_NOT_STICKY
    }
    if (!wanted) {
      stopSelf()
      return START_NOT_STICKY
    }
    instance = this
    acquireWakeLock()
    // Not restarted after the system kills the process: the transfers went with it.
    return START_NOT_STICKY
  }

  // Android 15+ gives dataSync services 6 hours a day, counted again once the app is opened.
  override fun onTimeout(startId: Int, fgsType: Int) {
    blocked = true
    stop()
  }

  override fun onDestroy() {
    if (instance === this) {
      instance = null
      requested = false
    }
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  private fun enterForeground(s: Status) {
    val notification = build(this, s, ongoing = true)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(ONGOING_ID, notification)
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    wakeLock =
      getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FileBrowser:transfers")
        .apply {
          setReferenceCounted(false)
          acquire(WAKE_LOCK_MS)
        }
  }

  private fun stop() {
    if (instance === this) {
      instance = null
      requested = false
    }
    stopSelf()
  }

  companion object {
    private const val TAG = "TransferService"
    private const val CHANNEL_ID = "transfers"
    private const val ONGOING_ID = 1
    private const val FINISHED_ID = 2
    // Longer than Android 15 lets the service run, short enough that a missed release can't
    // keep the phone awake overnight.
    private const val WAKE_LOCK_MS = 6 * 60 * 60 * 1000L

    private var instance: TransferService? = null
    private var status: Status? = null
    /** Whether JavaScript currently wants the service running. */
    private var wanted = false
    /** Start requested and not stopped since. */
    private var requested = false
    /** Android refused to start it, or its time ran out; tried again once the app is opened. */
    private var blocked = false

    /** Starts the service with `next` as its notification, or updates the notification. */
    fun show(context: Context, next: Status) {
      status = next
      wanted = true
      val manager = context.getSystemService(NotificationManager::class.java)
      ensureChannel(manager, next.channelName)
      if (instance != null) {
        manager.notify(ONGOING_ID, build(context, next, ongoing = true))
        return
      }
      if (requested || blocked) return
      manager.cancel(FINISHED_ID)
      try {
        val intent = Intent(context, TransferService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        requested = true
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException: only an app on screen may start one.
        Log.w(TAG, "Couldn't start", e)
        blocked = true
      }
    }

    /** Stops the service; with `finished`, leaves a notification saying how the transfers ended. */
    fun hide(context: Context, finished: Status?) {
      wanted = false
      // A start still on its way stops itself in onStartCommand; a new show() may start again.
      requested = false
      instance?.stop()
      if (finished == null) return
      val manager = context.getSystemService(NotificationManager::class.java)
      ensureChannel(manager, finished.channelName)
      manager.notify(FINISHED_ID, build(context, finished, ongoing = false))
    }

    fun onAppForeground() {
      blocked = false
    }

    private fun ensureChannel(manager: NotificationManager, name: String) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      // Also renames an existing channel after a language change. Low importance: no sound.
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW),
      )
    }

    private fun build(context: Context, s: Status, ongoing: Boolean): Notification {
      val builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Notification.Builder(context, CHANNEL_ID)
        } else {
          @Suppress("DEPRECATION") Notification.Builder(context)
        }
      builder
        .setSmallIcon(iconFor(s.icon))
        .setContentTitle(s.title)
        .setContentText(s.text)
        .setContentIntent(openApp(context))
        .setOnlyAlertOnce(true)
        .setShowWhen(!ongoing)
      if (ongoing) {
        builder.setOngoing(true).setCategory(Notification.CATEGORY_PROGRESS)
        if (s.progress < 0) builder.setProgress(0, 0, true) else builder.setProgress(1000, s.progress, false)
        // Android 12+ otherwise holds back a foreground service's notification for 10 seconds.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }
      } else {
        builder.setAutoCancel(true)
      }
      return builder.build()
    }

    private fun iconFor(name: String) =
      when (name) {
        "upload" -> android.R.drawable.stat_sys_upload
        "uploadDone" -> android.R.drawable.stat_sys_upload_done
        "downloadDone" -> android.R.drawable.stat_sys_download_done
        "error" -> android.R.drawable.stat_notify_error
        else -> android.R.drawable.stat_sys_download
      }

    /** Brings the app's existing task to the front. */
    private fun openApp(context: Context): PendingIntent? {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
  }
}
