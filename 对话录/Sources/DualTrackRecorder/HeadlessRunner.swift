import AppKit

/// headless 路线（阶段10.1）：无 Dock、无菜单栏，纯后台录音进程。
/// 由 server.py 的 `open -n 四土对话录.app --args --headless` 拉起，靠落盘的
/// .recorder.pid / .recorder.error 与 server 通信，不走任何 UI。
///
/// 同样经 NSApplication + delegate 的 didFinishLaunching 启动——阶段10 的教训：
/// UI 对象绝不能在 app.run() 之前 / 属性初始化器里创建。这里虽然是 headless（没有
/// NSStatusItem），仍然遵守同一条纪律：recorder.start() 放进 didFinishLaunching，
/// 不提前到属性初始化器。
final class HeadlessDelegate: NSObject, NSApplicationDelegate {
    private let recorder = Recorder()
    private var sigtermSource: DispatchSourceSignal?
    private var sigintSource: DispatchSourceSignal?

    private var pidFileURL: URL {
        dualtrackDataDir().appendingPathComponent(".recorder.pid")
    }
    private var errorFileURL: URL {
        dualtrackDataDir().appendingPathComponent(".recorder.error")
    }

    private func dualtrackDataDir() -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/situ/data/dualtrack")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        Log.shared.info("[headless] applicationDidFinishLaunching 进入")
        NSApp.setActivationPolicy(.prohibited)  // 纯后台，无 Dock 无菜单栏（spec §1）

        // 忽略默认 SIGTERM/SIGINT，改用 DispatchSourceSignal 走 recorder.stop() 的正常收尾路径
        signal(SIGTERM, SIG_IGN)
        signal(SIGINT, SIG_IGN)

        let term = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        term.setEventHandler { [weak self] in
            Log.shared.info("[headless] 收到 SIGTERM，走正常停止收尾")
            self?.recorder.stop()
        }
        term.resume()
        sigtermSource = term

        let int = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        int.setEventHandler { [weak self] in
            Log.shared.info("[headless] 收到 SIGINT，走正常停止收尾")
            self?.recorder.stop()
        }
        int.resume()
        sigintSource = int

        recorder.delegate = self
        recorder.start()
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        return .terminateNow
    }

    private func writePidFile() {
        guard let dir = recorder.currentSessionDirName else {
            Log.shared.info("[headless] 警告：recorderDidStart 时 currentSessionDirName 为 nil")
            return
        }
        let iso = ISO8601DateFormatter()
        let payload: [String: Any] = [
            "pid": ProcessInfo.processInfo.processIdentifier,
            "dir": dir,
            "startedAt": iso.string(from: Date()),
        ]
        do {
            try FileManager.default.createDirectory(at: dualtrackDataDir(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted])
            try data.write(to: pidFileURL, options: .atomic)
            Log.shared.info("[headless] .recorder.pid 已写: \(payload)")
        } catch {
            Log.shared.info("[headless] 写 .recorder.pid 失败: \(error.localizedDescription)")
        }
    }

    private func removePidFile() {
        try? FileManager.default.removeItem(at: pidFileURL)
    }

    private func writeErrorFile(_ message: String) {
        let ts = ISO8601DateFormatter().string(from: Date())
        let line = "[\(ts)] \(message)\n"
        do {
            try FileManager.default.createDirectory(at: dualtrackDataDir(), withIntermediateDirectories: true)
            try line.write(to: errorFileURL, atomically: true, encoding: .utf8)  // 覆盖写（spec §1）
        } catch {
            Log.shared.info("[headless] 写 .recorder.error 失败: \(error.localizedDescription)")
        }
    }
}

extension HeadlessDelegate: RecorderDelegate {
    func recorderDidStart() {
        Log.shared.info("[headless] recorderDidStart")
        writePidFile()
    }

    func recorderDidStop(dir: URL) {
        Log.shared.info("[headless] recorderDidStop dir=\(dir.lastPathComponent)，正常退出")
        removePidFile()
        exit(0)
    }

    func recorderDidFail(error: Error) {
        // headless 下不弹 NSAlert：无人看见还挂进程（spec §1）。菜单栏模式的 alert 不受影响。
        Log.shared.info("[headless] recorderDidFail: \(error.localizedDescription)")
        writeErrorFile(error.localizedDescription)
        removePidFile()
        exit(1)
    }

    func recorderElapsedTime(_ seconds: Int) {
        // headless 不需要展示计时；server 的 /api/recorder_status 靠 pid 文件里的 startedAt 现算。
    }
}

/// 运行 headless 模式：NSApplication + delegate 的标准启动路径，不在 run() 之前创建任何东西。
func runHeadless() {
    let app = NSApplication.shared
    let delegate = HeadlessDelegate()
    app.delegate = delegate
    app.run()
}
