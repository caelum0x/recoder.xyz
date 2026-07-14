// NAPI-RS build script — required to link against the Node.js headers/import lib.
extern crate napi_build;

fn main() {
    napi_build::setup();
}
