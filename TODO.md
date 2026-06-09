# TODO

Personal maintenance notes for this toolkit. Not part of the published guides.

## Pending

- [ ] **Switch chat language to English-only.**
      Update the persona line in [`.claude/CLAUDE.md`](.claude/CLAUDE.md) —
      `Communicate in Vietnamese when user speaks Vietnamese` — to English-only.
  - **Reason:** my English isn't strong yet; I'm actively improving it.
  - **When:** deferred — flip this once I'm comfortable (date TBD).
  - **Note:** all docs / skills / workflows are already in English (converted 2026-06-02).
    Only the _chat_ language is still Vietnamese for now.

- [ ] **Improve the CI/CD process.**
  - **Status:** no concrete plan yet — to be designed later.
  - **Idea:** spin up a dedicated instance (VM) on **Proxmox VE** to run & test the CI/CD pipeline.
  - **When:** deferred — will implement later.
  - **Note:** the IaC CI gate (`.github/workflows/iac-scan.yml`) and `secret-scan.yml` were verified
    **local-equivalent** only (same tools/flags run locally with binaries — 2026-06-09). Their actual
    **GitHub Actions run** is still untested — validate it when this CI work happens.
