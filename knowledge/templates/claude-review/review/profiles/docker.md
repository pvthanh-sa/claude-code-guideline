# Profile: Docker (Dockerfile, docker-compose)

> Kit-owned. Globs: `**/Dockerfile*`, `**/*.dockerfile`, `**/docker-compose*.y*ml`,
> `**/compose*.y*ml`, `.dockerignore`. hadolint / trivy may run in CI — don't re-list.

## Security
- Secrets in the image: `ARG`/`ENV` holding tokens or passwords (visible in `docker history`),
  `COPY .env`, `COPY . .` without a `.dockerignore` that excludes `.env*`, `.git`, keys. Use
  BuildKit `--mount=type=secret`.
- Runs as root (no `USER`), or `USER` set before steps that then fail silently on permissions.
- Base image unpinned (`latest`, or a floating major like `node:20` in a prod image when the repo
  pins elsewhere); images from unknown registries; `curl | sh` without a checksum.
- `ADD <url>` (no checksum, follows redirects) instead of `COPY` / a verified download.

## Correctness & runtime
- Shell-form `CMD`/`ENTRYPOINT` (`CMD npm start`) → the app is not PID 1, SIGTERM is not
  delivered, graceful shutdown never happens. Use exec form; `npm start` also swallows signals —
  run `node` directly.
- `HEALTHCHECK` missing on a production image, or one that uses a tool not installed in the final
  stage (`curl` in distroless/alpine).
- Multi-stage: build tools / dev dependencies / source left in the final stage; the final stage
  missing files the app needs at runtime (migrations, templates, `package.json` for `type`).
- `npm install` instead of `npm ci` (or the pnpm/yarn frozen-lockfile equivalent); lockfile not
  copied before install → non-reproducible builds.
- Layer-cache order: `COPY . .` before dependency install → every code change reinstalls deps.
- `apt-get install` without `--no-install-recommends` and without cleaning lists in the same
  `RUN` (🟡 only).
- Platform: images built on arm64 laptops for amd64 deploys without `--platform`.

## docker-compose
- `depends_on` without `condition: service_healthy` where startup order matters.
- Secrets inline in `environment:` instead of `env_file`/secrets; ports bound to `0.0.0.0` for
  databases on shared hosts; unpinned image tags.
