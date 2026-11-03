#!/bin/zsh
# Runs the engine tests. With full Xcode installed plain `swift test` works;
# with only Command Line Tools, Swift Testing needs its framework path passed explicitly.
cd "${0:A:h}"
F=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
if [[ "$(xcode-select -p)" == /Library/Developer/CommandLineTools ]]; then
  swift test -Xswiftc -F -Xswiftc $F -Xswiftc -Xfrontend -Xswiftc -disable-cross-import-overlays \
    -Xlinker -F -Xlinker $F -Xlinker -rpath -Xlinker $F "$@"
else
  swift test "$@"
fi
