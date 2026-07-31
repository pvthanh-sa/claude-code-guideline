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
    - name: Verify the target is the expected OS family and the blast radius is bounded
      ansible.builtin.assert:
        that:
          - ansible_os_family == 'RedHat'
          - ansible_play_hosts | length <= onprem_max_hosts | int
        fail_msg: >-
          Refusing to run: expected a RedHat-family host and at most
          {{ onprem_max_hosts }} target(s), got {{ ansible_os_family }} and
          {{ ansible_play_hosts | length }}. Pass a narrower --limit.

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

## Rolling changes across more than one host

```yaml
- name: Roll the web tier
  hosts: webservers_prod        # a LEAF group, never the `webservers` parent
  serial: 1                     # one host at a time
  max_fail_percentage: 0        # stop the whole run on the first failure
```
