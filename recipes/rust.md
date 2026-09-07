# Rust

**Detect:** `Cargo.toml`.

**Verify steps:**
| name | cmd |
|---|---|
| format | `cargo fmt --check` |
| lint | `cargo clippy -- -D warnings` |
| test | `cargo test` |

**Verification strength:** strong. The toolchain ships with the language, clippy catches real bugs rather than style nits, and the compiler rejects most of what tests would otherwise have to find.

**Pitfalls**
- `cargo check` is far faster than `cargo build` when you only need to know it compiles. Use it in the edit loop; keep `test` in the gate.
- Fighting the borrow checker by sprinkling `.clone()` and `Rc<RefCell<_>>` is a sign the ownership model is wrong. Rethink who owns the data instead.
- No `.unwrap()` or `.expect()` in library code — return `Result` and use `?`. Reserve unwrap for tests and `main`.
- Clippy is authoritative here in a way lint tools usually aren't. If it fires, fix it rather than allowing it.
- Check the `edition` in `Cargo.toml` before writing code; idioms differ between editions.
- Unit tests live in the same file under `#[cfg(test)] mod tests`; integration tests go in `tests/`. Follow that split.

**Setup (greenfield)**
```bash
cargo init
```
