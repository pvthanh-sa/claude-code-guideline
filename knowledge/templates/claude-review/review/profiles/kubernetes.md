# Profile: Kubernetes manifests & Helm charts

> Kit-owned. Globs: `k8s/**`, `kubernetes/**`, `manifests/**`, `deploy/**`, `charts/**`,
> `helm/**`, `**/kustomization.yaml`, YAML files with `apiVersion:` + `kind:`.

## Rollout safety
- Changing a Deployment/StatefulSet `spec.selector` (immutable) → apply fails; changing labels
  that a Service/NetworkPolicy/PDB selects → traffic or policy silently stops matching.
- StatefulSet `volumeClaimTemplates` changes (immutable); PVC `storageClassName` changes.
- `replicas` set in the manifest while an HPA manages the workload → every deploy resets scale.
- `maxUnavailable`/`maxSurge` or a PDB that blocks all evictions (`minAvailable` = replicas), or a
  PDB missing on a critical service with >1 replica.
- Image tag `latest` or no tag; mutable tags with `imagePullPolicy: IfNotPresent`.

## Health & resources
- Missing `readinessProbe` (traffic before ready) or `livenessProbe`; a liveness probe that checks
  dependencies (DB down → restart storm); probe timing shorter than startup without a
  `startupProbe`.
- Missing `resources.requests`/`limits`; memory limit below the app's real heap
  (`-Xmx`, `--max-old-space-size`) → OOMKilled; CPU limits on latency-sensitive services
  (throttling) — 🟡 only.
- `terminationGracePeriodSeconds` shorter than in-flight work; no `preStop` delay behind an LB.

## Security
- `privileged: true`, `allowPrivilegeEscalation`, `runAsUser: 0` / no `runAsNonRoot: true`,
  writable root FS without reason, added capabilities, `hostNetwork`/`hostPID`/`hostPath`.
- Secrets in ConfigMaps or plain `env.value`; Secret manifests with real values committed
  (base64 is not encryption).
- RBAC: `ClusterRole` where a namespaced `Role` fits; verbs `*`, resources `*`; access to
  `secrets` cluster-wide; binding to the `default` ServiceAccount; `automountServiceAccountToken`
  left on for workloads that never call the API.
- No `NetworkPolicy` for a namespace that relies on default-deny; a policy that opens to all
  namespaces.
- IRSA / Pod Identity: role trust scoped to the exact namespace + service account.

## Helm
- Values referenced in templates that are missing from `values.yaml` (render empty); `required`
  missing on must-set values; chart dependency versions unpinned; `Chart.yaml` version not
  bumped when the chart changes (if the repo publishes charts).
- `toYaml` indentation errors (`nindent` wrong) — render mentally the changed template.
- Always set `namespace`.
