"""Reject missing, skipped or failing native tests instead of accepting zero tests."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

EXPECTED = {
    "startsBundledApplicationAndLegalNotice",
    "opensThreeDestinationPlanner",
    "switchesVehicleProfilesAndCompatibleConnectors",
    "opensBackupControlsWithNativePlugins",
}

directory = Path(sys.argv[1] if len(sys.argv) > 1 else "android/app/build/outputs/androidTest-results/connected")
files = sorted(directory.rglob("*.xml"))
if not files:
    raise SystemExit("No se generaron resultados XML de las pruebas Android")
seen = set()
for file in files:
    root = ET.parse(file).getroot()
    for suite in root.iter("testsuite"):
        for attr in ("failures", "errors", "skipped"):
            if int(suite.get(attr, "0")):
                raise SystemExit(f"Pruebas Android incompletas: {attr} en {file}")
    for case in root.iter("testcase"):
        if any(case.find(tag) is not None for tag in ("failure", "error", "skipped")):
            raise SystemExit(f"Prueba Android fallida u omitida: {case.get('name')}")
        if case.get("classname") == "es.cargagratis.app.NativeSmokeTest":
            seen.add(case.get("name"))
if not EXPECTED.issubset(seen):
    raise SystemExit("Faltan pruebas Android: " + ", ".join(sorted(EXPECTED - seen)))
print(f"Android real: {len(EXPECTED)} pruebas de WebView aprobadas, sin omisiones")
