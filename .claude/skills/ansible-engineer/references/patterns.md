# Ansible Patterns

Canonical snippets. All modern syntax (FQCN, `loop`, `include_tasks`), written against the house
floor of ansible-core 2.17+ (see `knowledge/templates/ansible/requirements.yml`).

## Role skeleton

`ansible-galaxy init roles/<name>` scaffolds it. Trim what you don't use.

```
roles/strongswan/
├── defaults/main.yml     # overridable: versions, ports, paths, feature flags
├── vars/main.yml         # internal constants (OS package names, fixed paths)
├── tasks/main.yml        # entrypoint — keep thin, include_tasks per concern
├── handlers/main.yml     # restart/reload handlers
├── templates/            # *.j2
├── files/                # static files, vendored artifacts
└── meta/main.yml         # dependencies, supported platforms
```

`tasks/main.yml` as a table of contents:
```yaml
---
- name: Include OS-specific variables
  ansible.builtin.include_vars: "{{ ansible_os_family }}.yml"

- name: Install packages
  ansible.builtin.import_tasks: packages.yml

- name: Configure the daemon
  ansible.builtin.import_tasks: configure.yml

- name: Configure the firewall
  ansible.builtin.import_tasks: firewall.yml
  when: strongswan_manage_firewall | bool
```

## Thin top-level playbook

```yaml
---
- name: Configure on-prem VPN gateway
  hosts: onprem                    # never 'all'
  become: false                    # escalate per task instead
  gather_facts: true

  pre_tasks:
    # Assert what the operator can actually get wrong. `inventory_hostname in groups['onprem']`
    # would be tautological inside `hosts: onprem` — `--limit` can only narrow a play, never widen it.
    #
    # `ansible_play_hosts_all`, NOT `ansible_play_hosts`. Under `serial:` (which the rolling-change
    # pattern below mandates for multi-host runs) `ansible_play_hosts` is the CURRENT BATCH — with
    # `serial: 1` it is always 1, so a `<= max` ceiling passes for a 300-host run and the guard can
    # never fire. `ansible_play_hosts_all` is every host the play targets, unaffected by batching.
    - name: Verify the target is the expected OS family and the blast radius is bounded
      ansible.builtin.assert:
        that:
          - ansible_os_family == 'RedHat'
          - ansible_play_hosts_all | length <= onprem_max_hosts | int
        fail_msg: >-
          Refusing to run: expected a RedHat-family host and at most
          {{ onprem_max_hosts }} target(s), got {{ ansible_os_family }} and
          {{ ansible_play_hosts_all | length }}. Pass a narrower --limit.

  roles:
    - role: strongswan
    - role: frr
      when: onprem_enable_bgp | bool
```

## Handlers, including the mid-play flush

```yaml
  tasks:
    - name: Deploy swanctl configuration
      ansible.builtin.template:
        src: swanctl.conf.j2
        dest: /etc/strongswan/swanctl/swanctl.conf   # NOT /etc/swanctl on Rocky 9
        owner: root
        group: root
        mode: '0600'
      become: true
      notify: Reload strongswan

    # When a later task depends on the restart having already happened:
    - name: Apply pending restarts before verification
      ansible.builtin.meta: flush_handlers

    - name: Verify the tunnel is up
      ansible.builtin.command: swanctl --list-sas
      register: sas
      changed_when: false
      failed_when: "'ESTABLISHED' not in sas.stdout"

  handlers:
    - name: Reload strongswan
      ansible.builtin.systemd_service:
        name: strongswan
        state: reloaded
      become: true
```

## Idempotent `command` — the four escape hatches

```yaml
# 1. creates — skip if the artifact already exists
- name: Generate the CA certificate
  ansible.builtin.command: /usr/bin/make-ca --out /etc/pki/ca.crt
  args:
    creates: /etc/pki/ca.crt

# 2. removes — only run while the file still exists
- name: Clear the migration lock
  ansible.builtin.command: /opt/app/bin/unlock
  args:
    removes: /var/lib/app/.migrating

# 3. changed_when: false — read-only command, never a change
- name: Read the current schema version
  ansible.builtin.command: /opt/app/bin/schema-version
  register: schema
  changed_when: false

# 4. changed_when: <expr> — derive "changed" from real output
- name: Sync application assets
  ansible.builtin.command: /opt/app/bin/sync-assets
  register: sync
  changed_when: "'0 files updated' not in sync.stdout"
```

## Conditionals and failure semantics

> **Do not check-then-act on a service.** `state: started` is already idempotent, so
> `command: systemctl is-active` + `when:` is redundant, *less* reliable (it skips a unit that
> exists but is `failed`), and fails the production lint gate via `command-instead-of-module`.
> Just declare the state:

```yaml
- name: Ensure myapp is running and enabled at boot
  ansible.builtin.systemd_service:
    name: myapp
    state: started
    enabled: true
  become: true
```

`failed_when:` earns its place where there genuinely is no module — a vendor CLI whose exit code
does not mean what Ansible assumes:

```yaml
- name: Query the licence status
  ansible.builtin.command: /opt/vendor/bin/licctl status
  register: lic
  changed_when: false          # read-only
  failed_when: lic.rc not in [0, 2]   # 2 means "expiring soon" — informational, not a failure

- name: Warn when the licence is expiring
  ansible.builtin.debug:
    msg: 'Licence expiring: {{ lic.stdout }}'
  when: lic.rc == 2
```

Never reach for `ignore_errors: true`. Define real failure with `failed_when:` instead.

## Blocks — grouping and rollback

```yaml
- name: Apply the kernel tuning profile
  block:
    - name: Deploy sysctl profile
      ansible.builtin.template:
        src: 99-ipsec-bgp.conf.j2
        dest: /etc/sysctl.d/99-ipsec-bgp.conf
        owner: root
        group: root
        mode: '0644'
      register: sysctl_profile

    # Gate on the template result. A bare `changed_when: true` here would report `changed`
    # on EVERY run, so the second-run `changed=0` idempotency proof could never pass.
    # A handler would also be idempotent, but handlers fire after the block — outside the
    # rescue below — so the rollback would no longer cover a rejected profile.
    - name: Reload sysctl
      ansible.builtin.command: sysctl --system
      when: sysctl_profile is changed
      changed_when: true
  rescue:
    - name: Remove the broken profile
      ansible.builtin.file:
        path: /etc/sysctl.d/99-ipsec-bgp.conf
        state: absent

    - name: Fail with context
      ansible.builtin.fail:
        msg: 'sysctl profile rejected; removed it and stopped'
  always:
    - name: Record the attempt
      ansible.builtin.debug:
        msg: 'sysctl tuning attempted on {{ inventory_hostname }}'
  become: true
```

## Loops

```yaml
- name: Install VPN packages
  ansible.builtin.dnf:
    name: '{{ strongswan_packages }}'      # a module that accepts a list needs NO loop
    state: present
  become: true

- name: Open the required firewall services
  ansible.posix.firewalld:
    service: '{{ item }}'
    permanent: true
    immediate: true
    state: enabled
  loop:
    - ipsec
    - bgp
  become: true

- name: Wait for the tunnel to establish
  ansible.builtin.command: swanctl --list-sas
  register: sas
  until: "'ESTABLISHED' in sas.stdout"
  retries: 12
  delay: 5
  changed_when: false
```

> Prefer passing a list to a module that accepts one (`dnf`, `apt`, `package`) over looping —
> one transaction instead of N.

## Templates

```yaml
- name: Deploy the FRR configuration
  ansible.builtin.template:
    src: frr.conf.j2
    dest: /etc/frr/frr.conf
    owner: frr
    group: frr
    mode: '0640'
    validate: '/usr/bin/vtysh --dryrun --inputfile %s'   # reject a bad config before writing
    backup: true
  become: true
  notify: Restart frr
```

In the template, mark it managed and keep logic shallow:
```jinja
{{ ansible_managed | comment }}
router bgp {{ frr_local_asn }}
 neighbor {{ frr_peer_ip }} remote-as {{ frr_peer_asn }}
{% for net in frr_advertised_networks %}
 network {{ net }}
{% endfor %}
```

## Downloads — always pin

```yaml
- name: Fetch the RDS CA bundle
  ansible.builtin.get_url:
    url: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
    dest: /etc/pki/rds/global-bundle.pem
    checksum: 'sha256:{{ rds_ca_bundle_sha256 }}'   # unpinned download = MITM window
    owner: root
    group: root
    mode: '0644'
  become: true
```

If the upstream rotates the artifact and pinning would break bootstrap, **vendor the file into
`files/`** and `copy` it instead — do not silently drop the checksum.

## Multi-OS

`vars/RedHat.yml` and `vars/Debian.yml`, selected by fact:
```yaml
- name: Include OS-specific variables
  ansible.builtin.include_vars: '{{ ansible_os_family }}.yml'
```
```yaml
# vars/RedHat.yml         (Rocky 9 / Amazon Linux 2023 — the house default)
strongswan_packages:
  - strongswan
  - strongswan-swanctl
strongswan_conf_dir: /etc/strongswan/swanctl
```
```yaml
# vars/Debian.yml
strongswan_packages:
  - strongswan
  - charon-systemd
strongswan_conf_dir: /etc/swanctl
```

Branch on facts, never on hostnames:
```yaml
when: ansible_os_family == 'RedHat' and ansible_distribution_major_version | int >= 9
```

### A path variable is not enough — the tools *answer* differently

The three constants a copy-paste catches are package name, unit name and config path. The fourth is
the one that costs a day: **the equivalent tools disagree about how they report.**

| | RedHat | Debian |
|---|---|---|
| binary | `/usr/bin/needs-restarting` | `/usr/sbin/needrestart` |
| "reboot required?" | the **exit code** (1 = yes) | **stdout** (`NEEDRESTART-KSTA` > 1) |
| stale services | `-s`, one unit per line | `NEEDRESTART-SVC:` lines |
| side effect | none | **restarts them** unless `-r l` |

Substituting only the path swaps the binary and keeps the wrong parser. Branch, then **normalise
both branches into the same named facts** so everything downstream is OS-blind:

```yaml
# vars/RedHat.yml → fleet_patch_restart_check_flavour: needs-restarting
# vars/Debian.yml → fleet_patch_restart_check_flavour: needrestart
- name: Normalise the RedHat answers
  ansible.builtin.set_fact:
    patch_reboot_required: '{{ probe.rc == 1 }}'
    patch_stale_services: '{{ probe.stdout_lines | default([]) }}'
```

Verified on Ubuntu 24.04 (2026-08-01). Note the last row: a read-only *question* that restarts
services by default is its own incident — check what batch mode does before running it fleet-wide.

### The failure mode this hides: a polite, correct SKIPPED

The role above installed the **right** package on Ubuntu and then looked for the RedHat binary. It
did not error. It printed:

> `SKIPPED on int-2: /usr/bin/needs-restarting is not installed, so "patched but still running the
> old binary" could NOT be checked on this host. This is a gap in coverage, not a pass.`

Honest, well-engineered, and a hole — on a host that could have answered. **A well-behaved SKIPPED
is the hardest coverage gap to notice, because everything about it looks like the system working.**
When a check reports SKIPPED, the question is not "is the message good" but "could this host have
answered, and did we ask the right way?"

### `validate:` can be denied by AppArmor or SELinux before it parses a line

```
fatal: [ubuntu-host]: FAILED! => msg: failed to validate
  stderr: Could not open /home/svc/.ansible/tmp/ansible-tmp-*/.source.conf : Permission denied
```

Root-owned file, read as root, `Permission denied`. It is not a file permission — it is mandatory
access control, and the module names the symptom of the wrong subsystem:

```
$ journalctl -k | grep apparmor
apparmor="DENIED" operation="open" profile="/usr/sbin/chronyd"
name="/home/svc/.ansible/tmp/.../.source.conf" requested_mask="r" denied_mask="r" fsuid=0 ouid=0
```

`fsuid=0 ouid=0` is the tell. Ubuntu's chronyd profile grants reads only under `/etc/chrony/**`, and
`validate:` points the binary at Ansible's staged copy in the login user's remote tmp.

- `sshd -t` and `visudo -c` are **unconfined** on both families — the common validators are safe.
- `chronyd`, `named` and anything else with a shipped enforce-mode profile are **not**.

Remedy that keeps a real check — validate *after* the write, at the file's final path, inside the
same `block`/`rescue`, ordered **before** `flush_handlers` so a bad file is caught while the daemon
still runs the old one:

```yaml
- name: Validate where the pre-write validator cannot run
  ansible.builtin.command:
    argv: ['/usr/sbin/chronyd', '-p', '-f', '{{ config_file }}']
  become: true
  changed_when: false
  check_mode: false        # in check mode the template wrote nothing; without this the task
                           # parses the PRE-EXISTING file and passes for a config never previewed
  when: (config_validate | default('', true) | trim | length) == 0
```

State the downgrade rather than hiding it: on that platform the guarantee becomes *"a broken config
never stays"* instead of *"a broken config is never written"*.

Rejected remedies, so the next person does not re-derive them: pointing `ansible_remote_tmp` inside
`/etc/<service>/` satisfies the profile (`**` crosses `/`) and puts Ansible scratch files in `/etc`;
editing the AppArmor profile makes the fleet's security posture depend on a config-management
convenience.

## SELinux — set the context, never disable

```yaml
- name: Allow the web server to make network connections
  ansible.posix.seboolean:
    name: httpd_can_network_connect
    state: true
    persistent: true
  become: true
  # On a host without SELinux, `ansible_selinux` is the boolean False — a bare
  # `ansible_selinux.status` then fails with "'bool object' has no attribute 'status'".
  # The default() filter absorbs that and the task simply skips.
  when: ansible_selinux.status | default('disabled') == 'enabled'

- name: Register the SELinux file context for the app directory
  community.general.sefcontext:            # persistent policy entry...
    target: '/opt/app(/.*)?'
    setype: httpd_sys_content_t
    state: present
  become: true
  notify: Restore SELinux labels on /opt/app

# handler
- name: Restore SELinux labels on /opt/app
  ansible.builtin.command: restorecon -irF /opt/app   # ...then apply it
  changed_when: true
  become: true
```

> **`file:`'s `setype:` is not persistent.** It relabels the inode now, but the label is lost on the
> next `restorecon -R /` or filesystem relabel, and it does not apply to files created later under
> that path. It also re-reports `changed` after any relabel, which reads as idempotency drift. Use
> `sefcontext` (policy) + `restorecon` (apply) as above when the labeling must survive.

## The Terraform seam

Ansible consumes; Terraform owns. Take values in at run time, never commit them:

```bash
TF_ENV=../terraforms/<project>/environments/<env>

ansible-playbook site.yml \
  --limit onprem \
  -e "aws_tunnel_ip=$(terraform -chdir=$TF_ENV output -raw tunnel1_address)" \
  -e "vpn_psk=$(terraform -chdir=$TF_ENV output -raw tunnel1_psk)" \
  --check --diff
```

Guard the inputs so a missing output fails loudly rather than templating an empty string:
```yaml
- name: Assert required Terraform inputs are present
  ansible.builtin.assert:
    that:
      - aws_tunnel_ip is defined and aws_tunnel_ip | length > 0
      - vpn_psk is defined and vpn_psk | length > 0
    fail_msg: 'Missing Terraform outputs — pass them with -e (see references/patterns.md)'
    quiet: true
```

> **No `no_log:` on this assert.** `no_log` censors the *whole* task result, including `fail_msg` —
> the guard would fail with `output has been hidden` and tell the operator nothing. It is also
> unnecessary: `assert` reports the failing *expression*, never the variable's value, so
> `vpn_psk | length > 0` cannot leak the PSK.

## Previewing a role that creates the accounts it then configures

`ansible.posix.authorized_key` **fails in check mode when the target user does not exist yet** —
"Either user must exist or you must provide full path to key file". On a brand-new host that aborts
the entire `--check --diff` at the first account, which is exactly the run a first-time preview is
for. Gate on what the host actually has, and *name* what could not be previewed rather than letting
the gap pass silently:

```yaml
- name: Read the accounts the host already has
  ansible.builtin.getent:
    database: passwd

- name: Install operator keys
  ansible.posix.authorized_key:
    user: '{{ item.name }}'
    key: '{{ item.key }}'
    exclusive: true          # the roster IS the state — anything not listed is removed
  loop: '{{ fleet_access_users }}'
  # In check mode the module cannot inspect a user that does not exist yet.
  when: not ansible_check_mode or item.name in ansible_facts.getent_passwd

- name: Report which accounts could NOT be previewed
  ansible.builtin.debug:
    msg: >-
      NOT PREVIEWED (account does not exist yet):
      {{ fleet_access_users | rejectattr('name', 'in', ansible_facts.getent_passwd) | map(attribute='name') | list }}
  when: ansible_check_mode
```

> `exclusive: true` is what makes revocation work: removing a person from the list removes their key
> from every host on the next run — including keys nobody ever installed through Ansible. Without it
> the roster only ever adds.

## Loading a role's declarations without running it

A reporting play must compare observed state against **the same values the baseline applies**. Giving
the report its own copies creates a second definition site — the "which value is real?" failure. A
role listed with `when: false` still contributes its `defaults/` and `vars/`, so its declarations are
in scope while none of its tasks run:

```yaml
- name: Collect compliance evidence
  hosts: fleet
  gather_facts: true
  roles:
    - {role: fleet_access,   when: false}   # declarations only — every task skips
    - {role: fleet_firewall, when: false}
    - role: fleet_compliance                # the only role that actually runs
```

Caveat: this pulls in `defaults/main.yml` and `vars/main.yml` only. Values a role sets at run time
via an `include_vars` **task** are not available, so read those through `| default(...)`.

## Substituting for gate 4 when no host is reachable

`--check --diff` against a real host is blocking, and "the host was down" is not a pass. When the
fleet is genuinely unreachable, a throwaway container of the right OS family gives you a real,
line-level diff for the file/account layer — **labelled as a substitute, never presented as gate 4**:

```bash
podman run -d --name preview rockylinux:9 /bin/sleep infinity   # or docker
podman exec preview dnf -y install openssh-server sudo
printf '[preview]\npreview ansible_connection=community.docker.docker\n' > /tmp/preview-inv.ini
ansible-playbook site.yml -i /tmp/preview-inv.ini --limit preview --check --diff --tags access
```

State plainly what it cannot cover: no systemd, no firewalld, no SELinux — so the firewall, SELinux
and handler-restart paths are **still unproven**. Keep the scratch inventory outside the repo so it
can never be mistaken for a real target.

## A compliance check needs five statuses, not two

A report that only says PASS/FAIL forces every awkward case into one of them, and the awkward cases
are where the value is. Five values, and the distinctions are the whole point:

| Status | Means | Never confuse with |
|---|---|---|
| `PASS` | Observed matches declared, **read off the machine** | a green task |
| `FAIL` | Observed differs. The run goes red | advisory |
| `ACTION REQUIRED` | True state, not compliant, and this baseline **cannot** fix it (a pending reboot when the role deliberately never reboots) | `PASS` — that hides a pending kernel update behind a green report |
| `SKIPPED` | The check **could not run**. A coverage gap to close | `PASS` — "we did not look" and "we looked and it was fine" are different claims |
| `NOT APPLICABLE` | The failure this check exists to catch **cannot occur on this host** | `SKIPPED` — one is a fact about the platform, the other is a hole in the evidence |

`NOT APPLICABLE` earns its place the first time a second OS family arrives. Example: a check that
firewalld's runtime set matches its permanent set guards a real drift; ufw keeps one rule set loaded
from `/etc/ufw` at boot, so there is nothing to disagree. Reporting that as `SKIPPED` puts permanent,
unfixable noise in the coverage-gap column until nobody reads that column any more.

### Name checks after the requirement, not after the mechanism

A row called `selinux_persistent` reports **FAIL** on a correct Ubuntu host, because Ubuntu has no
SELinux. The requirement was never "SELinux is enforcing" — it was "mandatory access control is
enforcing". Rename to `mac_runtime` / `mac_persistent`, branch the *reading* (`getenforce` +
`ansible_facts.selinux` vs `aa-status --json` + `systemctl is-enabled apparmor`), and the same row
means the same thing on every host.

The general form: **a check named after one implementation will eventually report a false FAIL on a
host that is fine** — and a gate that cries wolf is a gate people stop reading.

### The report is the part that silently stops covering a new host

Worth stating on its own, because it is the counter-intuitive half: when a fleet gains an OS family,
the *baseline* fails loudly and gets fixed. The *assurance layer* keeps running, keeps printing the
new host in its summary table, and quietly answers nothing for it. An assurance layer that goes quiet
on the newest host is worse than an absent one, because the table still looks complete. After adding
a host of a new family, read the report for that host row by row and require **zero** `SKIPPED`.

## The four ways a check reports a pass it has not earned

All four were found in one review of one repo, by asking of every verification: *what happens
when the probe itself fails?*

**1. The rc gate in the wrong clause.** The single highest-yield defect shape:

```yaml
# WRONG -- the assert vanishes exactly when it is needed
- command: [/usr/sbin/getenforce]
  register: probe
  failed_when: false                     # so a missing binary does not crash the run
- assert:
    that: probe.stdout | trim == 'enforcing'
  when: probe.rc | default(1) == 0       # <-- probe failed? assert SKIPPED. Play green.

# RIGHT -- the read's success is part of what is asserted
- assert:
    that:
      - probe.rc | default(1) == 0
      - probe.stdout | trim == 'enforcing'
    fail_msg: >-
      {% if (probe.rc | default(1)) != 0 %}COULD NOT VERIFY: the probe exited
      {{ probe.rc | default('(never ran)') }}. A gate that cannot look does not pass.
      {% else %}SELinux is {{ probe.stdout | trim }}, expected enforcing.{% endif %}
  when: feature_enabled | bool
```

A **report** may answer SKIPPED. A **gate** may not. And `display_skipped_hosts = False` in
`ansible.cfg` hides the evidence that it happened.

**2. Whitelisting a tool's exit code without reading its man page.** The code is often the
answer, and the same number means opposite things:

| Tool | rc 1 | rc 2 | rc 100 | "could not look" |
|---|---|---|---|---|
| `dnf check-update` | — | — | **updates available** | — |
| `apt-get --simulate` | — | — | **ERROR** (apt-get(8)) | — |
| `needs-restarting -r` | **reboot required** | — | — | — |
| `aa-status` | **not enabled** | **no policy loaded** | — | 3, 4, 42 |
| `grep` | no match | path unreadable | — | 2 |

`failed_when: rc not in [0, 100]` copied from the dnf task onto the apt task certifies a host
with broken sources as fully patched — by the one check that exists to detect under-patching.

**3. A status that costs nothing.** If SKIPPED never makes the run red, "we did not look" is
free, and a host where every probe failed reports 0 FAIL and exits 0. Give it a threshold —
`max_skipped_checks: 0` by default — so accepting a gap is a deliberate, greppable act.

**4. A comment that overstates its check.** *"enforcing means at least one profile in enforce
mode AND nothing we own in complain mode"* — where the code only counted enforce. The comment
is what the next author trusts instead of re-reading the expression, so it stops them adding
the missing half. Either implement the sentence or delete it.

## Cleanup must not be targeted the way the damage was

A fixture that breaks specific hosts by name must remove its artefacts from **every** host:

```yaml
- name: Place the rogue drop-in            # inject: targeted, on purpose
  when:
    - inventory_hostname == 'web-1'
    - drift_action == 'inject'

- name: Remove the rogue drop-in           # restore: EVERY host, always
  ansible.builtin.file: {path: /etc/ssh/sshd_config.d/00-aaa-rogue.conf, state: absent}
  when: drift_action == 'restore'
```

Rename or rebuild `web-1` and a hostname-gated restore matches nothing — so the file stays on
disk, armed for the next unrelated `systemctl reload sshd`, while the operator watches a green
"restore" run. Removing a file that was never there costs one `ok`; leaving one behind costs a
root login.

Two more rules for anything that damages hosts deliberately: give it **its own** blast-radius
ceiling (its legitimate radius differs from the baseline's, but it still needs one — the play
whose job is to break machines was the only one in the repo without), and gate it on something
a production inventory **cannot satisfy by convention**. `'pilot' in group_names` is a naming
convention; the next customer pilot will use the same name. Require a token defined only in the
disposable inventory's own `group_vars`.

## Two traps when parsing tool output

**1. The same parse implemented twice.** `sshd -T` emits one line per value for multi-value keywords,
so `AllowGroups a b` comes back as two `allowgroups` lines and `| first` fails a correct host. That
was fixed in one role — and found again, unfixed, in a second role that had to parse the same output.
The second copy is invisible to the test that caught the first. Make it a review question:
**"is this parse implemented anywhere else in this repo?"**

**2. The right number of backslashes depends on the YAML SCALAR STYLE — and getting it wrong
produces a regex that silently never matches.** This is the single most expensive small thing in
this document. Measured on ansible-core 2.21, same expression, same data, three scalar styles:

```yaml
vars:
  sample: "Reference ID : X\nStratum : 3\nLeap status     : Normal\n"

  folded_double_bs: >-
    {{ sample is search('^Leap status\\s*:\\s*Normal', multiline=True) }}   # -> False  ❌
  folded_single_bs: >-
    {{ sample is search('^Leap status\s*:\s*Normal',  multiline=True) }}   # -> True   ✅
  dquote_double_bs: "{{ sample is search('^Leap status\\s*:\\s*Normal', multiline=True) }}"  # -> True ✅
```

| YAML scalar style | YAML processes `\`? | Write |
|---|---|---|
| `>-` or `\|` (block) | **no** | `\s` — a single backslash |
| `'...'` (single-quoted) | **no** | `\s` — a single backslash |
| `"..."` (double-quoted) | **yes**, `\\` → `\` | `\\s` — a double backslash |
| plain (unquoted) | **no** | `\s` — a single backslash |

Most Ansible regexes live in block scalars, so **the double backslash that looks careful is the
broken one**. It reaches the regex engine as *"a literal backslash, then s"*, which matches nothing
— and `\\S`, `\\d`, `\\(` all fail the same way. There is no error: the filter returns a
non-match, the check goes FAIL, and the reported *observed* value is correct, so the report looks
like a host problem. Four of these existed at once in one repo, including in the assert meant to
stop a self-lockout — it would have refused every legitimate run.

Two habits that make it not happen: prefer a match with **no backslash class at all**
(`'Leap status' in line` is often enough), and when a regex fails against data you can see is
right, test the expression in both scalar styles before touching the data.

**Backreferences are the same trap, one layer worse.** `\1` in a `regex_replace` has to survive
YAML, then Jinja, then `re.sub`, and a wrong count emits the literal text `\1` as the answer —
a wrong value published as data, not an error anyone sees. Prefer stripping a tail over capturing
a group:

```yaml
# fragile: '^([0-9]+(?:/(?:tcp|udp))?)\s+ALLOW IN.*$'  ->  '\1'
# robust:  strip what you do not want, keep what is left
{{ lines | map('regex_replace', '\s+ALLOW IN.*$', '')
         | map('regex_replace', '\s*\(v6\)$', '')
         | select('match', '^[0-9]+(/(tcp|udp))?$') | unique | sort | list }}
```

A filter chain that cannot fail that way is worth more than a shorter one.

## Rolling changes across more than one host

```yaml
- name: Roll the web tier
  hosts: webservers_prod        # a LEAF group, never the `webservers` parent
  serial: 1                     # one host at a time
  max_fail_percentage: 0        # stop the whole run on the first failure
```
