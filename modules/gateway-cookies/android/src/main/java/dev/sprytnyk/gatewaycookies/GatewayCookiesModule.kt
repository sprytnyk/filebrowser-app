package dev.sprytnyk.gatewaycookies

import android.webkit.CookieManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the WebView cookie store, which React Native's fetch shares but the native clients of
 * expo-image, expo-video and expo-file-system don't. Sign-in gateways such as Authelia keep
 * their session in an HttpOnly cookie, so JavaScript can't read it any other way.
 */
class GatewayCookiesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GatewayCookies")

    // The Cookie header value the WebView would send to `url`, or null when there is none.
    Function("getCookie") { url: String ->
      CookieManager.getInstance().getCookie(url)
    }
  }
}
