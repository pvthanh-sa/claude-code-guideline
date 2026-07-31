# Troubleshooting Ansible

Triage in this order: **connection → privilege → module arguments → logic → idempotency**. Most
"Ansible is broken" reports are SSH problems.

## 1. Connection

Always start with the smallest possible test, then escalate verbosity:

```bash
ansible <host> -i inventory.ini -m ansible.builtin.ping          # is the host reachable at all?
ansible <host> -i inventory.ini -m ansible.builtin.ping -vvv     # shows the exact ssh command used
ssh -v <host>                                                     # take Ansible out of the picture
```

Verbosity levels: `-v` output data · `-vv` + input · `-vvv` + connection details (**the useful one**)
· `-vvvv` + connection plugin internals.

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Permission denied (publickey)` | Wrong user or key | Set `ansible_user`; confirm the key via `ssh -v`; prefer a `~/.ssh/config` alias |
| `Host key verification failed` | Unknown host key | Add the host key properly (`ssh-keyscan` into `known_hosts`). **Do not** disable `host_key_checking` |
| Hangs, then times out | Bastion hop missing | Add `ansible_ssh_common_args='-o ProxyCommand="ssh -W %h:%p -q <bastion>"'`, or use an ssh-config alias |
| `Authentication refused: bad ownership or modes` | Perms on the target's `~/.ssh` | `~/.ssh` = `0700`, `authorized_keys` = `0600`, owned by the user |
| `/usr/bin/python: not found` | No/other interpreter | `ansible_python_interpreter=/usr/bin/python3`, or leave `interpreter_python = auto_silent` |
| `MODULE FAILURE ... No module named` | Missing lib on the *target* | Install it on the target (e.g. `python3-firewall` for `firewalld`) |
| `boto3 required` | Missing lib on the **control node** | `pip3 install boto3 botocore` (for `amazon.aws`) |

Server-side SSH debugging when the client side looks fine — run a second sshd on a spare port:
```bash
sudo /usr/sbin/sshd -d -p 2222     # on the target; watch the handshake live
ssh -p 2222 user@target
```

## 2. Privilege escalation

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Missing sudo password` | `become` needs a password | Vault `ansible_become_pass`, or pass `-K` |
| `sudo: a password is required` in check mode | Same | Same — check mode still escalates |
| `sudo: sorry, you must have a tty` | `requiretty` in sudoers + pipelining | Remove `requiretty`, or disable `pipelining` |
| Task works by hand, fails via Ansible | Non-interactive shell has a different `PATH`/env | Use absolute paths; set `environment:` on the task |

## 3. Module arguments

```bash
ansible-doc ansible.builtin.copy                 # authoritative parameter list
ansible-doc -s ansible.posix.firewalld           # short form — a paste-ready snippet
ansible-galaxy collection list                   # is the collection even installed?
```

- `Unsupported parameters` → the parameter belongs to a different module or a newer collection version
- `couldn't resolve module/action` → the collection is missing; add it to `requirements.yml` and
  `ansible-galaxy collection install -r requirements.yml`
- Templating errors (`'dict object' has no attribute`) → the variable isn't what you think:
  ```yaml
  - name: Inspect the variable
    ansible.builtin.debug:
      var: my_var          # 'var' takes a NAME (no {{ }}); 'msg' takes a string (needs {{ }})
  ```

## 4. Logic

```bash
ansible-playbook site.yml --list-tasks                # what will run, in order
ansible-playbook site.yml --list-hosts --limit stg    # what it would target — check before running
ansible-playbook site.yml --start-at-task "Deploy config"   # skip ahead (tasks must be named)
ansible-playbook site.yml --step                      # confirm each task interactively
ansible-playbook site.yml --tags configure            # narrow the run
```

Common logic traps:
- **A task is unexpectedly skipped** → print the condition's inputs; remember `when` uses Jinja
  *without* `{{ }}`, and a list under `when` is AND-ed.
- **Undefined variable on some hosts only** → the variable lives in one group's vars, and the play
  targets a wider set. Give a default (`| default(...)`) or scope the play.
- **`when` on an include behaves oddly** → `import_tasks` applies the condition per task;
  `include_tasks` evaluates it once for the whole include.
- **Wrong value at runtime** → precedence. Trace it:
  ```bash
  ansible <host> -m ansible.builtin.debug -a 'var=my_var'
  ansible-inventory --host <host>     # every inventory-sourced variable for that host
  ```

## 5. Idempotency drift

The test: run **for real** twice; the second run must be `changed=0`.

```bash
ansible-playbook site.yml --limit <host> --check --diff   # 1. preview what would change
ansible-playbook site.yml --limit <host>                  # 2. apply
ansible-playbook site.yml --limit <host>                  # 3. re-apply — must be changed=0
```

> Do **not** use `--check` for step 3. Check mode *skips* `command`/`shell` tasks, so the very tasks
> that break idempotency never report anything — a clean check-mode pass proves almost nothing.

If a task is always `changed`:
1. Is it `command`/`shell`? → add `creates:` / `removes:` / `changed_when:`
2. Is it `lineinfile` with a regex that never matches its own output? → make the regexp match the
   line the task writes
3. Is it `template` rendering non-deterministically (timestamps, dict ordering, `random`)? → remove
   the nondeterminism from the template
4. Is it `file` with a mode/owner the target keeps resetting? → something else manages that path

## Logging & profiling

Ansible logs nothing by default:
```ini
[defaults]
log_path = ./ansible.log
stdout_callback = yaml
callbacks_enabled = profile_tasks     ; per-task timings — finds the slow one
```
> `log_path` output can contain sensitive data. Gitignore it; rely on `no_log: true` to keep secrets
> out in the first place.

## Fast checks worth memorizing

```bash
ansible --version                       # core version, config file in effect, collections path
ansible-config dump --only-changed      # what your ansible.cfg actually overrides
ansible <host> -m ansible.builtin.setup # all facts for one host
ansible <host> -m ansible.builtin.setup -a 'filter=ansible_os_family'
ansible-inventory --graph               # group/host tree
```

## When it still fails

Reduce it: copy the failing task into a two-task playbook against one host with `-vvv`. Most bugs
become obvious once the surrounding play is gone. If it reproduces, you have a minimal report; if it
doesn't, the cause is in the play's variables or ordering, not the task.
