import AppKit

/// 菜单栏控制器：细线麦克风图标，菜单项「开始录音」/「停止录音」/「打开四土复盘」/「退出」。
/// 无主窗口（LSUIElement=true）。录音中图标变红点态、菜单显示已录时长。
final class StatusMenuController: NSObject {
    // NSStatusItem 必须等 applicationDidFinishLaunching 之后（setup() 里）再创建：
    // 在属性初始化器里建，会在 app.run() 之前触发 AppKit 抢跑 finishLaunching，
    // delegate 错过回调 → setup 不执行，图标窗口被扔在屏幕外（实测 X=-21,Y=-37）成死图标。
    private var statusItem: NSStatusItem!
    private let recorder = Recorder()

    private var startStopItem: NSMenuItem!
    private var elapsedItem: NSMenuItem!
    private var aecStatusItem: NSMenuItem!

    func setup() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        recorder.delegate = self
        if let button = statusItem.button {
            button.image = Self.micIcon(recording: false)
            button.image?.isTemplate = true
            if button.image == nil { button.title = "四" }  // SF Symbol 不可用时的可见兜底
        }
        statusItem.menu = buildMenu()
        Log.shared.info("StatusMenuController.setup 完成：NSStatusItem 建好，菜单已挂载")
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()

        elapsedItem = NSMenuItem(title: "未在录音", action: nil, keyEquivalent: "")
        elapsedItem.isEnabled = false
        menu.addItem(elapsedItem)
        menu.addItem(.separator())

        startStopItem = NSMenuItem(title: "开始录音", action: #selector(toggleRecording), keyEquivalent: "")
        startStopItem.target = self
        menu.addItem(startStopItem)

        let openReview = NSMenuItem(title: "打开四土复盘", action: #selector(openReview), keyEquivalent: "")
        openReview.target = self
        menu.addItem(openReview)

        menu.addItem(.separator())

        // 回声消除状态：只在录音中显示；只有回落态（AEC 不可用）才提「建议耳机」，
        // 正常态（AEC 已开启）绝不出现「建议戴耳机」字样（spec §1 硬红线）。
        aecStatusItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        aecStatusItem.isEnabled = false
        aecStatusItem.isHidden = true
        menu.addItem(aecStatusItem)

        menu.addItem(.separator())

        let quit = NSMenuItem(title: "退出", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        return menu
    }

    @objc private func toggleRecording() {
        if recorder.isRecording {
            recorder.stop()
        } else {
            recorder.start()
        }
    }

    @objc private func openReview() {
        if let url = URL(string: "http://127.0.0.1:18760") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    private static func micIcon(recording: Bool) -> NSImage? {
        let symbolName = recording ? "mic.circle.fill" : "mic"
        return NSImage(systemSymbolName: symbolName, accessibilityDescription: "四土对话录")
    }

    private func formatElapsed(_ seconds: Int) -> String {
        let m = seconds / 60, s = seconds % 60
        return String(format: "已录 %d:%02d", m, s)
    }
}

extension StatusMenuController: RecorderDelegate {
    func recorderDidStart() {
        statusItem.button?.image = Self.micIcon(recording: true)
        statusItem.button?.image?.isTemplate = false
        startStopItem.title = "停止录音"
        elapsedItem.title = "已录 0:00"

        aecStatusItem.isHidden = false
        aecStatusItem.title = recorder.aecActive
            ? "回声消除已开启"
            : "回声消除不可用，外放会串音（建议耳机）"
    }

    func recorderDidStop(dir: URL) {
        statusItem.button?.image = Self.micIcon(recording: false)
        statusItem.button?.image?.isTemplate = true
        startStopItem.title = "开始录音"
        elapsedItem.title = "未在录音"
        aecStatusItem.isHidden = true
        Log.shared.info("录音完成：\(dir.path)")
    }

    func recorderDidFail(error: Error) {
        statusItem.button?.image = Self.micIcon(recording: false)
        statusItem.button?.image?.isTemplate = true
        startStopItem.title = "开始录音"
        elapsedItem.title = "未在录音"
        aecStatusItem.isHidden = true

        Log.shared.info("录音失败: \(error.localizedDescription)")

        let alert = NSAlert()
        alert.messageText = "无法开始录音"
        alert.informativeText = error.localizedDescription
        alert.alertStyle = .warning
        alert.addButton(withTitle: "去系统设置")
        alert.addButton(withTitle: "好")
        NSApp.activate(ignoringOtherApps: true)
        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy")!
            NSWorkspace.shared.open(url)
        }
    }

    func recorderElapsedTime(_ seconds: Int) {
        elapsedItem.title = formatElapsed(seconds)
    }
}
