// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "DualTrackRecorder",
    platforms: [.macOS(.v15)],
    targets: [
        .executableTarget(
            name: "DualTrackRecorder",
            path: "Sources/DualTrackRecorder",
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        )
    ]
)
