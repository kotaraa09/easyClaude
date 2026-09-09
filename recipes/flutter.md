# Flutter

**Detect:** `pubspec.yaml` with a `flutter:` section, plus `lib/main.dart`.

**Verify steps:**
| name | cmd | tier |
|---|---|---|
| analyze | `flutter analyze` | fast |
| test | `flutter test` | fast |

**Verification strength:** strong — and worth stating plainly, because most mobile stacks aren't. `flutter test` runs widget tests headlessly with no emulator, no device, and no platform SDK. Mobile is not inherently unverifiable; Android and iOS native just make it hard.

**Pitfalls**
- Run `flutter pub get` after any `pubspec.yaml` change or the next command fails confusingly.
- `flutter analyze` is the real lint gate and it is strict by default. Fix its output rather than loosening `analysis_options.yaml`.
- `flutter build` needs the platform SDKs (Android SDK, or Xcode on macOS) — keep it out of the verify gate. Analyze and test are enough for the loop.
- Platform channels, camera, file pickers, and push notifications cannot be tested headlessly. Isolate them behind an interface, test the interface, and say plainly that the native side is unverified.
- Prefer `const` constructors wherever the analyzer suggests them; it's a real rebuild-performance win, not style.
- `setState` is fine for local widget state. Reach for a state-management package only when state genuinely outlives a widget.

**Setup (greenfield)**
```bash
flutter create .
```
