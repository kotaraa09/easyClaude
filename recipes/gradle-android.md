# Android (Gradle)

**Detect:** `build.gradle` or `build.gradle.kts` alongside `app/` and `AndroidManifest.xml`.

**Verify steps:**
| name | cmd |
|---|---|
| lint | `./gradlew lint` |
| unit test | `./gradlew testDebugUnitTest` |
| compile | `./gradlew assembleDebug` |

**Verification strength:** **partial.** JVM unit tests run headlessly and are genuinely useful, so business logic *can* be verified. But instrumented tests (`connectedAndroidTest`) need a running emulator or a physical device, and UI behaviour is unverified without one. Say this out loud to the user rather than implying the gate proves the app works.

**Pitfalls**
- Always `./gradlew`, never a system `gradle` — the wrapper pins the version the project expects.
- JDK version mismatches are the most common first failure. Check `JAVA_HOME` against the version the Gradle plugin requires before debugging anything else.
- The first build downloads a great deal and can take many minutes. Don't interpret slowness as a hang, and don't put a cold `assembleDebug` in a fast edit loop.
- **Android Studio holds a lock on the Gradle daemon.** A CLI build can block indefinitely while the IDE is open on the same project. Close it or expect the wait.
- `local.properties` contains `sdk.dir` and is machine-specific — it must never be committed.
- Push logic out of Activities and Fragments into plain Kotlin classes. That is the only part a headless gate can actually test, so the more that lives there the more the gate is worth.

**Setup (greenfield)**
Create the project in Android Studio. Scaffolding an Android project from the command line is possible but produces a layout that fights the IDE.
