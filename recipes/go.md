# Go

**Detect:** `go.mod`.

**Verify steps:**
| name | cmd |
|---|---|
| vet | `go vet ./...` |
| build | `go build ./...` |
| test | `go test ./...` |

**Verification strength:** strong. The toolchain is built in — nothing to install, and it's fast enough to run on every task.

**Pitfalls**
- Check every returned error. Don't discard with `_` to make something compile.
- `gofmt` is not optional; run `go fmt ./...` before committing.
- Table-driven tests are the convention here — follow it rather than writing one test per case.
- Interfaces are declared by the consumer, not the producer. Don't create an interface package.
- Keep the module path in `go.mod` consistent with the repo URL.

**Setup (greenfield)**
```bash
go mod init github.com/<user>/<project>
```
