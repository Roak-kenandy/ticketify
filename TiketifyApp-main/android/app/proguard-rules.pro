# Add project specific ProGuard rules here.
# React Native, Hermes, OkHttp, Play Services and the RN community modules ship
# their own consumer rules; only app-specific rules belong here.

# App native modules are looked up by name from JS.
-keep class com.ticketify.** { *; }
-keep class com.tiketify.** { *; }

# Strip verbose/debug/info logging from release builds so location data and
# API payloads never reach logcat.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
