package dev.sprytnyk.transferservice

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Drives TransferService from JavaScript, and gives it timers that run in the background. */
class TransferServiceModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  /** Token for pending delays, so they can be dropped without touching other posted work. */
  private val delays = Any()

  /** The context from the last call, for OnDestroy, when the React context may be gone already. */
  private var lastContext: Context? = null

  private val context: Context
    get() =
      (appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost())
        .also { lastContext = it }

  override fun definition() = ModuleDefinition {
    Name("TransferService")

    // Starts the service with this notification, or updates the notification.
    Function("show") { channelName: String, title: String, text: String, progress: Int, icon: String ->
      val ctx = context
      main.post { TransferService.show(ctx, Status(channelName, title, text, progress, icon)) }
    }

    // Stops the service. With a title, a notification stays behind saying how transfers ended.
    Function("hide") { channelName: String, title: String?, text: String?, icon: String? ->
      val ctx = context
      val finished = title?.let { Status(channelName, it, text ?: "", 0, icon ?: "downloadDone") }
      main.post { TransferService.hide(ctx, finished) }
    }

    // React Native pauses setTimeout while the app is in the background; this keeps counting.
    AsyncFunction("delay") { ms: Double, promise: Promise ->
      main.postAtTime({ promise.resolve() }, delays, SystemClock.uptimeMillis() + ms.toLong())
    }

    OnActivityEntersForeground {
      main.post { TransferService.onAppForeground() }
    }

    // The JavaScript side (and with it every transfer) is going away, e.g. on a reload.
    OnDestroy {
      main.removeCallbacksAndMessages(delays)
      val ctx = lastContext ?: return@OnDestroy
      main.post { TransferService.hide(ctx, null) }
    }
  }
}
