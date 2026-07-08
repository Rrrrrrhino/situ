import Foundation

/// 流式 WAV 写入器：16kHz 单声道 16-bit PCM。
/// 开始时写一个占位 44 字节 header（data 长度先填 0），后续样本追加写入 FileHandle（不攒内存）；
/// `finish()` 时 seek 回文件头，用真实累计字节数补写 RIFF chunk size + data chunk size。
final class WavWriter {
    static let sampleRate: UInt32 = 16_000
    static let bitsPerSample: UInt16 = 16
    static let numChannels: UInt16 = 1

    private let url: URL
    private var handle: FileHandle?
    private var dataBytesWritten: UInt32 = 0
    private let lock = NSLock()

    init?(url: URL) {
        self.url = url
        FileManager.default.createFile(atPath: url.path, contents: nil)
        guard let h = FileHandle(forWritingAtPath: url.path) else { return nil }
        self.handle = h
        writePlaceholderHeader()
    }

    private func writePlaceholderHeader() {
        var header = Data()
        header.append(contentsOf: Array("RIFF".utf8))
        header.append(uint32LE(0))                 // RIFF chunk size，占位，finish() 时回填
        header.append(contentsOf: Array("WAVE".utf8))
        header.append(contentsOf: Array("fmt ".utf8))
        header.append(uint32LE(16))                 // fmt chunk size
        header.append(uint16LE(1))                  // audioFormat = 1 (PCM)
        header.append(uint16LE(Self.numChannels))
        header.append(uint32LE(Self.sampleRate))
        let byteRate = Self.sampleRate * UInt32(Self.numChannels) * UInt32(Self.bitsPerSample / 8)
        header.append(uint32LE(byteRate))
        let blockAlign = Self.numChannels * (Self.bitsPerSample / 8)
        header.append(uint16LE(blockAlign))
        header.append(uint16LE(Self.bitsPerSample))
        header.append(contentsOf: Array("data".utf8))
        header.append(uint32LE(0))                 // data chunk size，占位，finish() 时回填
        handle?.write(header)
    }

    /// 已写入的 data 字节数（补零对齐时间轴用）。
    var bytesWritten: UInt32 {
        lock.lock(); defer { lock.unlock() }
        return dataBytesWritten
    }

    /// 追加一段 16bit 单声道 PCM 样本（流式写，不攒内存）。
    func append(pcm16: Data) {
        guard !pcm16.isEmpty else { return }
        lock.lock()
        handle?.write(pcm16)
        dataBytesWritten &+= UInt32(pcm16.count)
        lock.unlock()
    }

    /// 收尾：回填 header 里的长度字段，关闭文件。幂等（重复调用无副作用）。
    func finish() {
        lock.lock()
        defer { lock.unlock() }
        guard let h = handle else { return }
        let riffSize = 36 + dataBytesWritten
        h.seek(toFileOffset: 4)
        h.write(uint32LE(riffSize))
        h.seek(toFileOffset: 40)
        h.write(uint32LE(dataBytesWritten))
        try? h.synchronize()
        try? h.close()
        handle = nil
    }

    private func uint32LE(_ v: UInt32) -> Data {
        var le = v.littleEndian
        return Data(bytes: &le, count: 4)
    }
    private func uint16LE(_ v: UInt16) -> Data {
        var le = v.littleEndian
        return Data(bytes: &le, count: 2)
    }
}
