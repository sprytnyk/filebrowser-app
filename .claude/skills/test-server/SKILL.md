---
name: test-server
description: Spin up a local FileBrowser Quantum test server in Docker (the version the app is tested against), reachable from the phone over USB as http://localhost:8080 with admin / admin1. Use when the user wants a test server, a local server to test uploads, downloads, checksums or big files against, or asks to tear one down.
argument-hint: '[stop]'
---

# Test server

A throwaway FileBrowser Quantum server for manual testing on the phone. Defaults:

- image `gtstef/filebrowser:2.0.1-stable` (the version in README's Testing section)
- container `fb-test`, on `localhost:8080`
- login `admin` / `admin1`
- data in the session scratchpad: `<scratchpad>/fb-test/files` (the shared folder) and
  `<scratchpad>/fb-test/data` (config, database, cache). Wiped on reboot, which is fine here.

If `$ARGUMENTS` is `stop`, skip to Teardown.

## 1. Pre-flight

- `docker ps -a --filter name=fb-test` — if a container already exists, ask whether to reuse it
  (`docker start fb-test`) or replace it. Don't remove it without asking.
- Check port 8080 is free: `ss -ltn 'sport = :8080'`.
- `df -h` the scratchpad if the user plans big files (the README tests go up to about 3 GB).

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

Things that are easy to get wrong for 2.0.1:

- `adminUsername` and `adminPassword` go directly under `auth:`. The current upstream docs put
  them under `auth.methods.password`, and 2.0.1 refuses to start with
  `unknown field "adminPassword"`. Don't follow the newer docs for this version.
- An unset password, or `admin`, makes the server generate a random one and print it once in the
  logs. Use something else.
- The config password is applied again on every start ("Resetting admin user to default username
  and password" in the logs), so a password changed in the web UI doesn't survive a restart.
- The container listens on port 80, and source paths in the config are container paths.

## 3. Start

Pulling and running the image executes third-party code. Per the user's global rules, show the
exact command and wait for a clear yes before running it, even if it was approved in an earlier
session.

```bash
docker run -d --name fb-test \
  -p 8080:80 \
  -v $D/files:/folder \
  -v $D/data:/home/filebrowser/data \
  gtstef/filebrowser:2.0.1-stable
```

No `--restart`: the server shouldn't come back after a reboot.

## 4. Verify

```bash
docker ps --filter name=fb-test --format '{{.Status}}'   # Up ... (healthy)
docker logs fb-test 2>&1 | tail -20
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/            # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'X-Password: admin1' \
  'http://localhost:8080/api/auth/login?username=admin'                  # 200
```

If the container exited, the reason is in `docker logs fb-test`. A config error is fatal and
the server exits after 5 seconds. Fix `config.yaml` and `docker start fb-test`.

## 5. Phone

With the phone on USB (`adb devices` lists it):

```bash
adb reverse tcp:8080 tcp:8080
```

In the app, add `http://localhost:8080` and sign in as `admin` / `admin1`. `adb reverse` is lost
when the phone disconnects, so run it again after replugging.

## 6. Test files

For checksum and big-file tests, give the user these commands rather than creating large files
unasked:

```bash
head -c 3G /dev/urandom > $D/files/big-3g.bin   # random, so nothing compresses it in transit
sha256sum $D/files/*.bin                        # compare with the app's info sheet
```

Uploads from the phone land in `$D/files`, so `sha256sum` there checks them too. The server
indexes files created on the host on its own schedule, so pull to refresh if one doesn't show up.

## Report

Say briefly: the server URL and login, the two folder paths (full absolute paths), whether
`adb reverse` is set up, and the teardown commands.

## Teardown

```bash
docker rm -f fb-test
adb reverse --remove tcp:8080
```

Ask before deleting `<scratchpad>/fb-test` if it holds files the user uploaded and may still
want. The image `gtstef/filebrowser:2.0.1-stable` stays cached for next time.
