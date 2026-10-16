package dev.sprytnyk.pdfpages

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.Executors

/** Longest side of a rendered page, so a huge zoom or an odd page size can't exhaust memory. */
private const val MAX_SIDE = 4096

/**
 * Draws PDF pages with Android's built-in PdfRenderer, so PDFs open inside the app without a
 * third-party viewer. Pages are saved as JPEGs in the cache for expo-image to show.
 *
 * PdfRenderer allows one open page at a time, so all work runs on one thread of its own. That
 * also keeps a burst of page requests from tying up the shared modules queue.
 */
class PdfPagesModule : Module() {
  private val worker = Executors.newSingleThreadExecutor()
  private var openUri: String? = null
  private var descriptor: ParcelFileDescriptor? = null
  private var renderer: PdfRenderer? = null

  private val outDir
    get() = File(appContext.cacheDirectory, "pdf-pages")

  override fun definition() = ModuleDefinition {
    Name("PdfPages")

    // Renders from an earlier run may come from a cached PDF that changed since.
    OnCreate {
      worker.execute { outDir.deleteRecursively() }
    }

    OnDestroy {
      worker.execute { close() }
      worker.shutdown()
    }

    // Page sizes in PDF points, as [width, height] per page.
    AsyncFunction("open") { uri: String, promise: Promise ->
      onWorker(promise) {
        val r = rendererFor(uri)
        (0 until r.pageCount).map { i ->
          val page = r.openPage(i)
          try {
            listOf(page.width, page.height)
          } finally {
            page.close()
          }
        }
      }
    }

    // Draws page `index` `width` pixels wide on white; resolves with the image's file URI.
    AsyncFunction("render") { uri: String, index: Int, width: Int, promise: Promise ->
      onWorker(promise) { render(uri, index, width.coerceIn(1, MAX_SIDE)) }
    }
  }

  private fun onWorker(promise: Promise, block: () -> Any?) {
    worker.execute {
      try {
        promise.resolve(block())
      } catch (e: CodedException) {
        promise.reject(e)
      } catch (e: Throwable) {
        promise.reject("ERR_PDF_RENDER", e.message, e)
      }
    }
  }

  private fun rendererFor(uri: String): PdfRenderer {
    if (uri == openUri) renderer?.let { return it }
    close()
    val path = Uri.parse(uri).path ?: throw CodedException("ERR_PDF_INVALID", "Not a file URI", null)
    val fd = ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY)
    val opened = try {
      PdfRenderer(fd)
    } catch (e: SecurityException) {
      fd.close()
      throw CodedException("ERR_PDF_PASSWORD", "The PDF is password-protected", e)
    } catch (e: IOException) {
      fd.close()
      throw CodedException("ERR_PDF_INVALID", "The file isn't a readable PDF", e)
    }
    descriptor = fd
    renderer = opened
    openUri = uri
    return opened
  }

  private fun render(uri: String, index: Int, width: Int): String {
    // A cached PDF gets a new URI when it changes, so the URI alone names its renders.
    val out = File(outDir, "${Integer.toHexString(uri.hashCode())}/$index-$width.jpg")
    if (out.exists()) return Uri.fromFile(out).toString()

    val page = rendererFor(uri).openPage(index)
    try {
      val height = (width.toLong() * page.height / page.width).toInt().coerceIn(1, MAX_SIDE)
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      try {
        // Pages without a background would otherwise come out transparent (black in a JPEG).
        bitmap.eraseColor(Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        out.parentFile?.mkdirs()
        // Write aside and rename, so an interrupted write never leaves a half image behind.
        val tmp = File(out.path + ".tmp")
        FileOutputStream(tmp).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        tmp.renameTo(out)
      } finally {
        bitmap.recycle()
      }
    } finally {
      page.close()
    }
    return Uri.fromFile(out).toString()
  }

  private fun close() {
    try {
      renderer?.close()
      descriptor?.close()
    } catch (_: Exception) {
      // Already closed.
    }
    renderer = null
    descriptor = null
    openUri = null
  }
}
