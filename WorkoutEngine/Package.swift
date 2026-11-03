// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "WorkoutEngine",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [
        .library(name: "WorkoutEngine", targets: ["WorkoutEngine"]),
    ],
    targets: [
        .target(name: "WorkoutEngine"),
        .executableTarget(name: "engine-demo", dependencies: ["WorkoutEngine"]),
        .executableTarget(name: "bench", dependencies: ["WorkoutEngine"]),
        .testTarget(name: "WorkoutEngineTests", dependencies: ["WorkoutEngine"]),
    ]
)
