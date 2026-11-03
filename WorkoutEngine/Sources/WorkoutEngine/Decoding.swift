import Foundation

// Stored data must keep loading after app updates. These helpers let decoders fill in defaults for
// fields added later, skip values they no longer understand, and drop single bad items instead of
// failing a whole list.

/// Decodes an array, skipping elements that fail instead of failing the whole array.
public struct LossyArray<Element: Decodable>: Decodable {
    public var elements: [Element]

    public init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var elements: [Element] = []
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                elements.append(element)
            } else {
                _ = try? container.decode(Skip.self) // advance past the bad element
            }
        }
        self.elements = elements
    }

    private struct Skip: Decodable {
        init(from decoder: Decoder) throws {}
    }
}

extension KeyedDecodingContainer {
    /// The stored value, or `fallback` when the key is missing or unreadable.
    public func value<T: Decodable>(_ key: Key, or fallback: @autoclosure () -> T) -> T {
        ((try? decodeIfPresent(T.self, forKey: key)) ?? nil) ?? fallback()
    }

    public func lossyArray<T: Decodable>(_ key: Key) -> [T] {
        ((try? decodeIfPresent(LossyArray<T>.self, forKey: key)) ?? nil)?.elements ?? []
    }

    /// String-backed enum values, ignoring any this version doesn't know.
    public func knownCases<T: RawRepresentable>(_ key: Key) -> [T] where T.RawValue == String {
        let raw: [String] = value(key, or: [])
        return raw.compactMap(T.init(rawValue:))
    }
}
