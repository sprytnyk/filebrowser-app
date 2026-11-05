---
name: test-server
description: Start a local FileBrowser Quantum test server in Docker (the version the app is tested against), which the phone reaches over USB as http://localhost:8080 with admin / admin1. Use when the user wants a test server, a local server to test uploads, downloads, checksums or big files against, or asks to tear one down.
argument-hint: '[stop]'
---

# Test server

This skill starts a throwaway FileBrowser Quantum server for testing the app by hand on the
phone. The defaults:

- image `gtstef/filebrowser:2.0.2-stable`
- container `fb-test`, on `localhost:8080`
- login `admin` / `admin1`
- data in the session scratchpad: `<scratchpad>/fb-test/files` (the shared folder) and
  `<scratchpad>/fb-test/data` (config, database, cache). The scratchpad is wiped on reboot,
  which is fine here.

If `$ARGUMENTS` is `stop`, skip to Teardown.

## 1. Pre-flight

- Run `docker ps -a --filter name=fb-test`. If a container already exists, ask whether to reuse
  it (`docker start fb-test`) or replace it. Don't remove it without asking.
- Check that port 8080 is free with `ss -ltn 'sport = :8080'`.
- If the user plans big files, such as the 3 GB file in Test files, run `df -h` on the
  scratchpad.

## 2. Config

```bash
D=<scratchpad>/fb-test
mkdir -p $D/data $D/files
cat > $D/data/config.yaml <<'EOF'
server:
  cacheDir: /home/filebrowser/data/tmp
  sources:
    - path: /folder
      config:
        defaultEnabled: true
auth:
  adminUsername: admin
  adminPassword: admin1
  methods:
    password:
      enabled: true
EOF
chmod -R a+rwX $D
```

Things that are easy to get wrong in 2.0.x:

- `adminUsername` and `adminPassword` go directly under `auth:`. The current upstream docs put
  them under `auth.methods.password`, and 2.0.1 refuses to start with
  `unknown field "adminPassword"`. Don't follow the newer docs for this version.
- If the password is unset or `admin`, the server generates a random one and prints it once in
  the logs. Use something else.
- The server applies the config password again on every start ("Resetting admin user to
  default username and password" in the logs), so a password changed in the web UI doesn't
  survive a restart.
- The container listens on port 80, and source paths in the config are paths inside the
  container.

## 3. Start

Pulling and running the image executes third-party code. Per the user's global rules, show the
exact commands and wait for a clear yes before running them, even if the user approved them in
an earlier session. Pull first, so a wrong tag fails before anything starts:

```bash
docker pull gtstef/filebrowser:2.0.2-stable
docker run -d --name fb-test \
  -p 8080:80 \
  -v $D/files:/folder \
  -v $D/data:/home/filebrowser/data \
  gtstef/filebrowser:2.0.2-stable
```

Leave out `--restart`, so the server doesn't come back after a reboot.

## 4. Verify

```bash
docker ps --filter name=fb-test --format '{{.Status}}'   # Up ... (healthy)
docker logs fb-test 2>&1 | tail -20
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/            # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'X-Password: admin1' \
  'http://localhost:8080/api/auth/login?username=admin'                  # 200
```

If the container exited, `docker logs fb-test` shows why. A config error is fatal, and the
server exits after 5 seconds. Fix `config.yaml`, then run `docker start fb-test`.

## 5. Phone

With the phone on USB (`adb devices` lists it):

```bash
adb reverse tcp:8080 tcp:8080
```

In the app, add `http://localhost:8080` and sign in as `admin` / `admin1`. The phone forgets
`adb reverse` when it disconnects, so run it again after replugging.

## 6. Test files

For checksum and big-file tests, give the user these commands instead of creating large files
yourself:

```bash
head -c 3G /dev/urandom > $D/files/big-3g.bin   # random, so nothing compresses it in transit
sha256sum $D/files/*.bin                        # compare with the app's info sheet
```

Uploads from the phone end up in `$D/files`, so `sha256sum` there checks them too. The server
indexes files created on the host on its own schedule, so pull to refresh if one doesn't show
up.

## Report

Say briefly:

- the server URL and login
- the two folder paths, in full
- whether `adb reverse` is set up
- the teardown commands

## Teardown

```bash
docker rm -f fb-test
adb reverse --remove tcp:8080
```

Ask before deleting `<scratchpad>/fb-test` if it holds files the user uploaded and may still
want. The image `gtstef/filebrowser:2.0.2-stable` stays on this machine for next time.
