import AppKit
import ScreenCaptureKit
import AVFoundation
import CoreMedia

protocol RecorderDelegate: AnyObject {
    func recorderDidStart()
    func recorderDidStop(dir: URL)
    func recorderDidFail(error: Error)
    func recorderElapsedTime(_ seconds: Int)
}

/// 双轨对话录音器：麦克风轨 = 我，系统声音轨 = AI。
/// 系统声音轨照抄 kuailu Recorder.swift 的 SCStream 用法（capturesAudio + addStreamOutput(.audio) +
/// didOutputSampleBuffer）。**麦克风轨改用独立 AVAudioEngine + 系统级回声消除（VPIO）**——用户硬要求
/// 外放（不戴耳机）也要分清两轨，SCStream 的 `captureMicrophone` 是裸麦克风信号，没有回声消除，
/// 外放时会把 AI 的声音也录进麦轨；AVAudioEngine.inputNode.setVoiceProcessingEnabled(true) 是
/// FaceTime/电话同款的系统级 AEC，从麦信号里减掉正在外放的声音（spec §1）。
/// SCStream 仍然只负责系统声音轨（AI），且**不混音**：两路各自转换、各自写独立 WAV。
// @unchecked Sendable：Recorder 内部状态只在 audioQueue（SCStream 音频回调）、AVAudioEngine 内部的
// render 线程（installTap 回调）与 main（UI/生命周期）几条队列上访问，各自只碰自己独占的字段
// （audioQueue 碰 aiWriter/aiConverter，engine tap 碰 meWriter/meConverter，main 碰计时/状态标志），
// 没有交叉写同一字段，实际是线程安全的，这里显式断言给编译器，消除跨队列闭包捕获的 Sendable 警告。
final class Recorder: NSObject, @unchecked Sendable {
    weak var delegate: RecorderDelegate?

    /// 安全上限：2 小时自动停（spec §1）
    private static let maxDurationSeconds = 2 * 60 * 60

    private var stream: SCStream?
    private let audioQueue = DispatchQueue(label: "dualtrack.audio", qos: .userInitiated)

    /// 麦轨的独立引擎（AEC 路）。为 nil 表示当前用的是 fallback（SCStream captureMicrophone）路。
    private var micEngine: AVAudioEngine?

    private var meWriter: WavWriter?
    private var aiWriter: WavWriter?
    private let meConverter = AudioTrackConverter()
    private let aiConverter = AudioTrackConverter()

    private var sessionDir: URL?
    private var startedAt: Date?
    private var elapsedTimer: Timer?
    private var elapsedSeconds: Int = 0

    private(set) var isRecording = false
    /// 当前会话目录名（不含路径），仅供 headless 路写 .recorder.pid 用（阶段10.1 新增，只读、
    /// 不改变任何既有行为——阶段10 的 sessionDir 仍是 private，这里只加一个只读投影）。
    var currentSessionDirName: String? { sessionDir?.lastPathComponent }
    /// 本次录音麦轨是否走通了 AEC（AVAudioEngine + VPIO）；false = 回落到 SCStream 裸麦克风。
    /// StatusMenuController 读它决定菜单小字文案（只有回落态才提「建议耳机」，spec §1）。
    private(set) var aecActive = false

    /// 麦轨看门狗：本次录音麦轨 float 峰值（tap 回调抽样统计）。整场为 0 = 引擎级静音
    /// （权限被吞 / 声道降混失败之类），finalize 时写进 meta.json 让转写端能报准错误。
    private var micPeak: Float = 0

    /// SCStream 自动重启（2026-07-07）：系统屏幕内容重配置（关掉正在放音的窗口/切全屏）会
    /// 掐死 SCStream（didStopWithError「系统已停止流播放」）——这不是用户想停，录音必须续上。
    private var isRestartingStream = false
    private let restartLock = NSLock()
    /// 麦引擎配置变更观察者（设备切换时重启引擎用）；换引擎前先摘旧的。
    private var micEngineObserver: NSObjectProtocol?

    // MARK: - Start

    func start() {
        Task {
            do {
                try await startAsync()
            } catch {
                DispatchQueue.main.async { [weak self] in
                    self?.delegate?.recorderDidFail(error: error)
                }
            }
        }
    }

    private func startAsync() async throws {
        // 请求麦克风权限（系统声音权限由 SCStream capturesAudio 触发的「屏幕录制」权限单独走系统弹窗，
        // 没有对应的 AVCaptureDevice.requestAccess API，只能引导去系统设置）。
        let micGranted = await AVCaptureDevice.requestAccess(for: .audio)
        guard micGranted else {
            throw NSError(domain: "DualTrackRecorder", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "麦克风权限未授权。请到「系统设置 → 隐私与安全性 → 麦克风」里给「四土」开启权限后重试。"])
        }

        // 屏幕权限先探一次（失败时还没建目录/写文件，干净退出）
        let probe = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard probe.displays.first != nil else {
            throw NSError(domain: "DualTrackRecorder", code: 2,
                userInfo: [NSLocalizedDescriptionKey: "无法获取屏幕内容（可能缺屏幕录制权限）。请到「系统设置 → 隐私与安全性 → 屏幕录制」里开启权限，开完请重启本 App。"])
        }

        // 落盘目录：~/Documents/situ/data/dualtrack/<yyyyMMdd-HHmmss>/
        let now = Date()
        let dirFmt = DateFormatter()
        dirFmt.dateFormat = "yyyyMMdd-HHmmss"
        let situRoot = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/situ/data/dualtrack")
        let dir = situRoot.appendingPathComponent(dirFmt.string(from: now))
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        guard let mw = WavWriter(url: dir.appendingPathComponent("me.wav")),
              let aw = WavWriter(url: dir.appendingPathComponent("ai.wav")) else {
            throw NSError(domain: "DualTrackRecorder", code: 3,
                userInfo: [NSLocalizedDescriptionKey: "无法创建录音文件"])
        }
        meWriter = mw
        aiWriter = aw
        sessionDir = dir
        startedAt = now
        micPeak = 0

        // 麦轨优先走 AEC（AVAudioEngine + VoiceProcessing I/O）；失败则回落到 SCStream 裸麦克风路（spec §1）。
        let aecOK = startMicEngineWithAEC()
        aecActive = aecOK
        Log.shared.info(aecOK ? "麦轨 AEC 启动成功" : "麦轨 AEC 不可用，回落到 SCStream captureMicrophone")

        let str = try await makeAndStartStream()
        self.stream = str
        Log.shared.info("startCapture OK, dir=\(dir.lastPathComponent), aec=\(aecOK)")

        isRecording = true
        elapsedSeconds = 0
        DispatchQueue.main.async { [weak self] in
            self?.startElapsedTimer()
            self?.delegate?.recorderDidStart()
        }
    }

    /// 建流并启动捕获（初次启动与自动重启共用）。每次重新取 SCShareableContent——
    /// 旧的 filter/display 引用在系统内容重配置后可能已失效。
    private func makeAndStartStream() async throws -> SCStream {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "DualTrackRecorder", code: 2,
                userInfo: [NSLocalizedDescriptionKey: "无法获取屏幕内容（可能缺屏幕录制权限）"])
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // 仅音频，视频给最小值、帧直接丢弃（照 spec §1：video 尺寸给最小值）
        let cfg = SCStreamConfiguration()
        cfg.width = 2
        cfg.height = 2
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        cfg.showsCursor = false
        cfg.capturesAudio = true              // 系统声音 = AI（SCStream 只负责这一路）
        cfg.excludesCurrentProcessAudio = true
        cfg.sampleRate = 48_000
        cfg.channelCount = 2
        cfg.queueDepth = 6
        cfg.captureMicrophone = !aecActive     // AEC 已接管麦轨时，SCStream 不再重复抓麦；回落时用老路

        let str = SCStream(filter: filter, configuration: cfg, delegate: self)
        try str.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)  // 系统声音 = AI
        if !aecActive {
            // 回落路：SCStream 裸麦克风（无回声消除）
            try str.addStreamOutput(self, type: .microphone, sampleHandlerQueue: audioQueue)
        }
        try await str.startCapture()
        return str
    }

    /// 把一条轨补零到墙钟应有的长度（流中断重启后对齐时间轴用；<0.1s 缺口不补，上限 30min 防呆）。
    private func padTrackToWallClock(_ writer: WavWriter?, label: String, reason: String) {
        guard let w = writer, let started = startedAt else { return }
        let expectedBytesRaw = Int(Date().timeIntervalSince(started) * 16_000) * 2
        var pad = expectedBytesRaw - Int(w.bytesWritten)
        pad -= pad % 2
        guard pad >= 3_200 else { return }
        pad = min(pad, 30 * 60 * 16_000 * 2)
        w.append(pcm16: Data(count: pad))
        Log.shared.info("\(label) 轨补零 \(String(format: "%.1f", Double(pad) / 32_000))s（\(reason)）")
    }

    /// SCStream 死后自动重启：退避重试 5 次；起来后给 SCStream 供的轨补零对齐。
    /// 全部失败才诚实收尾（保住已录数据）。
    private func restartStreamLoop() async {
        defer {
            restartLock.lock(); isRestartingStream = false; restartLock.unlock()
        }
        let delays: [UInt64] = [500_000_000, 1_000_000_000, 2_000_000_000, 4_000_000_000, 8_000_000_000]
        for (i, d) in delays.enumerated() {
            try? await Task.sleep(nanoseconds: d)
            guard isRecording else { return }
            do {
                let str = try await makeAndStartStream()
                guard isRecording else { try? await str.stopCapture(); return }
                self.stream = str
                padTrackToWallClock(aiWriter, label: "ai", reason: "SCStream 重启")
                if !aecActive {
                    padTrackToWallClock(meWriter, label: "me", reason: "SCStream 重启")
                }
                Log.shared.info("SCStream 已自动重启（第 \(i + 1) 次尝试成功），录音继续")
                return
            } catch {
                Log.shared.info("SCStream 重启第 \(i + 1) 次失败: \(error.localizedDescription)")
            }
        }
        guard isRecording else { return }
        Log.shared.info("SCStream 重启多次失败，诚实收尾保数据")
        isRecording = false
        DispatchQueue.main.async { [weak self] in self?.stopElapsedTimer() }
        if let e = micEngine {
            e.inputNode.removeTap(onBus: 0)
            e.stop()
            micEngine = nil
        }
        finalizeAndWriteMeta()
        DispatchQueue.main.async { [weak self] in
            self?.delegate?.recorderDidFail(error: NSError(domain: "DualTrackRecorder", code: 20,
                userInfo: [NSLocalizedDescriptionKey: "屏幕音频流被系统反复中断且重启失败；已录部分已保存，可直接转写"]))
        }
    }

    /// 麦引擎配置变更（切耳机/换输入设备）后重启麦轨，并补零对齐。失败只报警不中断录音
    /// （finalize 的 micPeak 看门狗会把静音标进 meta）。
    private func restartMicEngine() {
        guard isRecording, aecActive else { return }
        if let ob = micEngineObserver { NotificationCenter.default.removeObserver(ob); micEngineObserver = nil }
        if let e = micEngine {
            e.inputNode.removeTap(onBus: 0)
            e.stop()
            micEngine = nil
        }
        if startMicEngineWithAEC() {
            padTrackToWallClock(meWriter, label: "me", reason: "麦引擎重启")
            Log.shared.info("麦引擎已重启，录音继续")
        } else {
            Log.shared.info("⚠️ 麦引擎重启失败，麦轨自此缺失（看门狗会标记）")
        }
    }

    /// 尝试启动 AEC 麦轨（AVAudioEngine + VoiceProcessing I/O）。成功返回 true 并把 `micEngine` 就绪；
    /// 任何一步 throw 都记日志、清理引擎、返回 false，调用方据此回落到 SCStream 裸麦克风路（spec §1）。
    private func startMicEngineWithAEC() -> Bool {
        let engine = AVAudioEngine()
        do {
            // 必须在 engine.start() 之前开启（spec §1）
            try engine.inputNode.setVoiceProcessingEnabled(true)

            // 绝不压低 AI 外放音量：VPIO 默认会 duck 其它音频，这里显式关掉（spec §1）
            if #available(macOS 14.0, *) {
                engine.inputNode.voiceProcessingOtherAudioDuckingConfiguration =
                    AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
                        enableAdvancedDucking: false, duckingLevel: .min)
            }

            // VPIO 下采样率可能是 24k/48k，别硬编码，跟着 inputNode 实际输出格式走
            let nativeFmt = engine.inputNode.outputFormat(forBus: 0)
            guard nativeFmt.sampleRate > 0, nativeFmt.channelCount > 0 else {
                throw NSError(domain: "DualTrackRecorder", code: 10,
                    userInfo: [NSLocalizedDescriptionKey: "VPIO 输入格式无效"])
            }
            // ⚠️ tap 必须显式要单声道：装了虚拟声卡（如 Background Music）的机器上，VPIO 会聚合出
            // 多声道输入格式（2026-07-07 实测 7ch），按原生格式 tap 再交给 AVAudioConverter 做
            // 多→1 降混会静默产出整场全零（声道映射失败但状态返回成功）。让引擎自己在 tap 处
            // 转成单声道则一切正常（同日 CLI 三模式对照实验坐实）。
            let tapFmt = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                       sampleRate: nativeFmt.sampleRate,
                                       channels: 1, interleaved: false) ?? nativeFmt
            Log.shared.info("麦轨 tap: native ch=\(nativeFmt.channelCount) sr=\(nativeFmt.sampleRate) → tap ch=\(tapFmt.channelCount)")

            engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: tapFmt) { [weak self] buf, _ in
                guard let self = self, self.isRecording else { return }
                // 看门狗抽样（每 16 个采样点看 1 个，够判断“整场是否全零”）
                if let ch = buf.floatChannelData {
                    var p = self.micPeak
                    for i in stride(from: 0, to: Int(buf.frameLength), by: 16) {
                        let v = abs(ch[0][i])
                        if v > p { p = v }
                    }
                    self.micPeak = p
                }
                guard let pcm = self.meConverter.convert(buf) else { return }
                self.meWriter?.append(pcm16: pcm)
            }

            try engine.start()
            micEngine = engine
            // 设备/路由变化（插拔耳机等）时 AVAudioEngine 停止供帧——观察到就重启麦轨续录
            micEngineObserver = NotificationCenter.default.addObserver(
                forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
            ) { [weak self] _ in
                guard let self = self, self.isRecording else { return }
                Log.shared.info("麦引擎配置变更（设备切换/路由变化），自动重启麦轨")
                DispatchQueue.main.async { self.restartMicEngine() }
            }
            return true
        } catch {
            Log.shared.info("AEC 启动失败: \(error.localizedDescription)")
            engine.inputNode.removeTap(onBus: 0)
            micEngine = nil
            return false
        }
    }

    // MARK: - Stop

    func stop() {
        guard isRecording else { return }
        isRecording = false
        stopElapsedTimer()

        let str = stream
        stream = nil
        let engine = micEngine
        micEngine = nil
        if let ob = micEngineObserver { NotificationCenter.default.removeObserver(ob); micEngineObserver = nil }

        if let e = engine {
            e.inputNode.removeTap(onBus: 0)
            e.stop()
        }

        Task {
            if let s = str {
                try? await s.stopCapture()
                try? s.removeStreamOutput(self, type: .audio)
                if !aecActive {
                    try? s.removeStreamOutput(self, type: .microphone)
                }
            }
            finalizeAndWriteMeta()
        }
    }

    private func finalizeAndWriteMeta() {
        meWriter?.finish()
        aiWriter?.finish()
        meWriter = nil
        aiWriter = nil

        guard let dir = sessionDir, let started = startedAt else { return }

        let iso = ISO8601DateFormatter()
        let micSilent = aecActive && micPeak <= 0
        if micSilent {
            Log.shared.info("⚠️ 麦轨看门狗：整场 micPeak=0（引擎级静音），已写 micSilent 进 meta")
        }
        let meta: [String: Any] = [
            "startedAt": iso.string(from: started),
            "durationSec": elapsedSeconds,
            "aec": aecActive,
            "micPeak": Double(micPeak),
            "micSilent": micSilent,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted]) {
            try? data.write(to: dir.appendingPathComponent("meta.json"))
        }
        // 目录写完整后再落 ready 空文件，避免半成品被读（spec §1）
        FileManager.default.createFile(atPath: dir.appendingPathComponent("ready").path, contents: nil)

        Log.shared.info("finalize done, dir=\(dir.lastPathComponent) durationSec=\(elapsedSeconds)")

        DispatchQueue.main.async { [weak self] in
            self?.delegate?.recorderDidStop(dir: dir)
        }
        sessionDir = nil
        startedAt = nil
    }

    // MARK: - Elapsed timer

    private func startElapsedTimer() {
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.elapsedSeconds += 1
            self.delegate?.recorderElapsedTime(self.elapsedSeconds)
            if self.elapsedSeconds >= Self.maxDurationSeconds {
                Log.shared.info("已到 2 小时安全上限，自动停止")
                self.stop()
            }
        }
    }

    private func stopElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }
}

// MARK: - SCStreamOutput

extension Recorder: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer,
                of outputType: SCStreamOutputType) {
        guard isRecording else { return }

        switch outputType {
        case .audio:
            // 系统声音 = AI
            guard let pcm = aiConverter.convert(buffer) else { return }
            aiWriter?.append(pcm16: pcm)
        case .microphone:
            // 麦克风 = 我。仅回落路（AEC 不可用时）才会注册这个 output，AEC 路的麦轨数据
            // 从 AVAudioEngine 的 installTap 回调直接写（见 startMicEngineWithAEC），不经过这里。
            guard let pcm = meConverter.convert(buffer) else { return }
            meWriter?.append(pcm16: pcm)
        case .screen:
            break  // 视频帧直接丢弃（spec §1：video 尺寸给最小值、视频帧直接丢弃）
        @unknown default:
            break
        }
    }
}

extension Recorder: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        Log.shared.info("stream didStopWithError: \(error.localizedDescription)")
        guard isRecording else { return }
        // 「系统已停止流播放」多发生在屏幕内容重配置（关掉正在放音的窗口/退全屏/切 Space）——
        // 这不是用户想停止录音。2026-07-07 用户两次跨 AI 窗口录音都在切窗瞬间被掐（71s/166s 实锤）。
        // 自动重启续录；麦轨走独立 AVAudioEngine 不受影响。
        self.stream = nil
        restartLock.lock()
        let alreadyRestarting = isRestartingStream
        if !alreadyRestarting { isRestartingStream = true }
        restartLock.unlock()
        if alreadyRestarting { return }
        Log.shared.info("SCStream 意外停止，尝试自动重启续录…")
        Task { await restartStreamLoop() }
    }
}
