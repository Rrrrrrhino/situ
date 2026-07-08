import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    // 延迟到 didFinishLaunching 再创建：属性初始化器在 app.run() 之前跑，
    // 那时建 UI 会触发 finishLaunching 抢跑竞态（详见 StatusMenuController.statusItem 注释）
    private var menuController: StatusMenuController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        Log.shared.info("applicationDidFinishLaunching 进入")
        NSApp.setActivationPolicy(.accessory)  // 菜单栏 App，无 Dock 图标、无主窗口
        let mc = StatusMenuController()
        mc.setup()
        menuController = mc
        // 人工双击才会走到这里（server 拉起录音一律 --headless，不进本分支）。
        // 菜单栏图标在图标很多的机器上会被 macOS 排到屏幕外（2026-07-06 实测 X=-21），
        // 双击后「毫无反应」——所以当面说清楚该去哪用，而不是让人对着空气猜。
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "四土对话录已在待命"
        alert.informativeText = "它是「四土」的后台录音引擎，平时不用手动打开。\n\n用法：打开四土 → 首页右上「口语复盘」→ 点「开始录音」。\n\n（菜单栏若有空位，也能看到它的话筒图标。）"
        alert.addButton(withTitle: "知道了")
        alert.runModal()
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        return .terminateNow
    }
}
