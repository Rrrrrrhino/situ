import AppKit

// --headless 时走无 UI 后台录音路线（阶段10.1，新文件 HeadlessRunner.swift）；
// 否则走现有菜单栏路线，零改动。
if CommandLine.arguments.contains("--headless") {
    runHeadless()
} else {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
