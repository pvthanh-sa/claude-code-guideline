# Secret-scan setup (Stage 6)

Tool-based secret scanning before code reaches GitHub — **Betterleaks** preferred (drop-in for
Gitleaks; both read `.gitleaks.toml`), enforced at two layers (defense-in-depth):

- **Layer 2 — local pre-push hook** (`pre-push`): blocks `git push` on this machine if a secret is found.
- **Layer 3 — CI** (`secret-scan.yml`): full-history scan on every push/PR; fails the run.

You can install this **automatically** with the `/secret-scan` skill, or **by hand** with the steps below.

## Manual install

```bash
# 1) Config (repo root)
cp gitleaks.toml /path/to/repo/.gitleaks.toml

# 2) Local pre-push hook — tracked in .githooks/ and shared via core.hooksPath
mkdir -p /path/to/repo/.githooks
cp pre-push /path/to/repo/.githooks/pre-push
chmod +x /path/to/repo/.githooks/pre-push
git -C /path/to/repo config core.hooksPath .githooks

# 3) CI workflow
mkdir -p /path/to/repo/.github/workflows
cp secret-scan.yml /path/to/repo/.github/workflows/secret-scan.yml
```

## Install the scanner

**Betterleaks (preferred)** — by the original Gitleaks author, MIT, drop-in: reads `.gitleaks.toml`
+ `.gitleaksignore` unchanged. Pick whichever fits your OS:

```bash
brew install betterleaks                              # macOS / Linuxbrew
docker pull ghcr.io/betterleaks/betterleaks:latest    # any Docker host
sudo dnf install betterleaks                          # Fedora
# from source (needs Go): git clone https://github.com/betterleaks/betterleaks && cd betterleaks && make build
```

**Gitleaks (fallback)** — single static binary, easiest on plain Linux without brew/docker:

```bash
brew install gitleaks                                 # macOS / Linuxbrew
# or download the binary for your OS/arch from github.com/gitleaks/gitleaks/releases
```

The pre-push hook and `/secret-scan` use a **three-way detection**: a `betterleaks` binary on PATH,
then a `gitleaks` binary, then **Betterleaks via the Docker image** (`docker image inspect` succeeds).
So `docker pull` alone is enough — no binary on PATH required for the local gate to work. CI uses the
gitleaks action by default (swap to the betterleaks image — see `secret-scan.yml`).

## Run a scan manually

```bash
betterleaks git . --redact --config .gitleaks.toml             # native betterleaks (scans git history)
gitleaks detect --no-banner --redact --config .gitleaks.toml   # gitleaks (betterleaks also accepts this for compat)
# Docker-only (no binary): -u matches host ownership so git won't reject the mounted repo
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/repo" -w /repo \
  ghcr.io/betterleaks/betterleaks:latest git . --redact --config .gitleaks.toml
```

## Optional Layer — GitHub push protection (native)

For an extra server-side gate, enable GitHub's native secret scanning + **push protection** in
repo settings → *Code security and analysis* (free for public repos; GitHub Advanced Security for
private/org). It rejects pushes containing recognised secret patterns.

## Notes

- Bypass the local hook only when you're certain it's a false positive: `git push --no-verify`.
- Real leak? **Rotate the credential immediately** — removing it from code is not enough.
- Persistent false positive? Add its fingerprint to `.gitleaksignore` (one per line).
