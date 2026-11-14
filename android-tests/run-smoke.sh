#!/usr/bin/env bash
set -euo pipefail

capture_diagnostics() {
  mkdir -p android-test-results
  adb logcat -d > android-test-results/logcat.txt 2>&1 || true
  adb exec-out screencap -p > android-test-results/screenshot.png 2>/dev/null || true
}
trap capture_diagnostics EXIT

adb logcat -c
adb shell input keyevent 82
./android/gradlew -p android :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=es.cargagratis.app.NativeSmokeTest --stacktrace
python3 android-tests/assert-results.py
