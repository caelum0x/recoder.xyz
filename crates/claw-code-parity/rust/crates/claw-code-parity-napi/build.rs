// NAPI build script — required by napi-build to emit the correct linker flags
// for each target platform (macOS, Linux, Windows).
extern crate napi_build;

fn main() {
    napi_build::setup();
}
