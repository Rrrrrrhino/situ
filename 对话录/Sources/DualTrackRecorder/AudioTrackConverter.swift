import AVFoundation
import CoreMedia

/// 单路音频转换器：把 SCStream 交付的任意格式 CMSampleBuffer（通常 48kHz/立体声/Float32）
/// 实时转成 16kHz / 单声道 / 16-bit PCM，直接产出可写入 WAV 的 `Data`。
///
/// 与 kuailu 的 AudioMixer 不同：这里不做双路叠加，只单路格式转换，用
/// AVAudioConverter 一步转到目标格式（输入格式变化时惰性重建 converter）。
final class AudioTrackConverter {
    private let target: AVAudioFormat
    private var converter: AVAudioConverter?
    private var cachedInputFormat: AVAudioFormat?

    init() {
        // 16kHz / mono / 16-bit 整数 PCM（非交错对单声道无意义，但 AVAudioFormat 要求指定）
        self.target = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                     sampleRate: 16_000,
                                     channels: 1,
                                     interleaved: true)!
    }

    /// 把一个 CMSampleBuffer 转成 16bit 单声道 PCM 字节；转换失败返回 nil（调用方跳过该帧，不中断录制）。
    func convert(_ sampleBuffer: CMSampleBuffer) -> Data? {
        guard let fmtDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fmtDesc),
              let inFormat = AVAudioFormat(streamDescription: asbd) else {
            return nil
        }

        let n = CMSampleBufferGetNumSamples(sampleBuffer)
        guard n > 0 else { return nil }

        guard let inBuf = AVAudioPCMBuffer(pcmFormat: inFormat, frameCapacity: AVAudioFrameCount(n)) else {
            return nil
        }
        inBuf.frameLength = AVAudioFrameCount(n)
        let copyStatus = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer, at: 0, frameCount: Int32(n), into: inBuf.mutableAudioBufferList
        )
        guard copyStatus == noErr else { return nil }

        guard let conv = converterFor(inFormat) else { return nil }

        let rateRatio = target.sampleRate / inFormat.sampleRate
        let outputCapacity = max(1, Int(ceil(Double(n) * rateRatio)) + 32)
        guard let outBuf = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(outputCapacity)) else {
            return nil
        }

        var suppliedInput = false
        var conversionError: NSError?
        let status = conv.convert(to: outBuf, error: &conversionError) { _, inputStatus in
            if suppliedInput {
                inputStatus.pointee = .noDataNow
                return nil
            }
            suppliedInput = true
            inputStatus.pointee = .haveData
            return inBuf
        }
        guard status != .error, outBuf.frameLength > 0 else { return nil }
        guard let int16Data = outBuf.int16ChannelData else { return nil }

        let frameCount = Int(outBuf.frameLength)
        return Data(bytes: int16Data[0], count: frameCount * MemoryLayout<Int16>.size)
    }

    /// 把一个已解码的 AVAudioPCMBuffer（AVAudioEngine tap 直接给的格式，如 VPIO 下的 24k/48k Float32）
    /// 转成 16bit 单声道 PCM 字节；转换失败返回 nil（调用方跳过该帧，不中断录制）。
    /// 与 `convert(_ sampleBuffer:)` 共享同一个 target/converter 缓存，只是输入源不同（CMSampleBuffer
    /// 来自 SCStream，AVAudioPCMBuffer 来自 AVAudioEngine tap）。
    func convert(_ pcmBuffer: AVAudioPCMBuffer) -> Data? {
        let inFormat = pcmBuffer.format
        let n = Int(pcmBuffer.frameLength)
        guard n > 0 else { return nil }

        guard let conv = converterFor(inFormat) else { return nil }

        let rateRatio = target.sampleRate / inFormat.sampleRate
        let outputCapacity = max(1, Int(ceil(Double(n) * rateRatio)) + 32)
        guard let outBuf = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(outputCapacity)) else {
            return nil
        }

        var suppliedInput = false
        var conversionError: NSError?
        let status = conv.convert(to: outBuf, error: &conversionError) { _, inputStatus in
            if suppliedInput {
                inputStatus.pointee = .noDataNow
                return nil
            }
            suppliedInput = true
            inputStatus.pointee = .haveData
            return pcmBuffer
        }
        guard status != .error, outBuf.frameLength > 0 else { return nil }
        guard let int16Data = outBuf.int16ChannelData else { return nil }

        let frameCount = Int(outBuf.frameLength)
        return Data(bytes: int16Data[0], count: frameCount * MemoryLayout<Int16>.size)
    }

    private func converterFor(_ inFormat: AVAudioFormat) -> AVAudioConverter? {
        if let cached = cachedInputFormat, cached == inFormat, let c = converter {
            return c
        }
        guard let c = AVAudioConverter(from: inFormat, to: target) else { return nil }
        c.primeMethod = .none  // 实时流逐包转换，不为离线编码预留前后填充帧
        converter = c
        cachedInputFormat = inFormat
        return c
    }
}
