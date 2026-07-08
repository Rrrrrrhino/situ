import Foundation

// MARK: - Simple file logger（照抄 kuailu Log.swift 模式，简化）
// Appends to ~/Library/Logs/DualTrackRecorder.log, one line per entry.

final class Log {
    static let shared = Log()

    private let queue = DispatchQueue(label: "dualtrack.log", qos: .utility)
    private let logURL: URL
    private let formatter: DateFormatter

    private init() {
        let logsDir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Logs")
        try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)
        logURL = logsDir.appendingPathComponent("DualTrackRecorder.log")

        formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
    }

    func info(_ message: String) {
        write(message)
    }

    private func write(_ message: String) {
        let ts = formatter.string(from: Date())
        let line = "[\(ts)] \(message)\n"
        queue.async { [weak self] in
            guard let self = self else { return }
            if let data = line.data(using: .utf8) {
                if FileManager.default.fileExists(atPath: self.logURL.path) {
                    if let handle = try? FileHandle(forWritingTo: self.logURL) {
                        handle.seekToEndOfFile()
                        handle.write(data)
                        try? handle.close()
                    }
                } else {
                    try? data.write(to: self.logURL)
                }
            }
        }
    }
}
