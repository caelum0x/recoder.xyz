# Daytona Self-Hosted Storage Runbook

This repo's self-hosted Daytona runner uses its **own Docker daemon** inside
`daytona-runner-1`. Its Docker root is mounted at `/var/lib/docker` inside the
runner container and is backed by the host XFS volume mounted at:

- host mount: `/mnt/HC_Volume_105319792`
- device: `/dev/disk/by-id/scsi-0HC_Volume_105319792`

## Critical requirement

Daytona sandbox creation uses Docker disk limits for sandbox storage. On Linux,
that path relies on Docker `--storage-opt size=...`, which only works with:

- `overlay2`
- backed by **XFS**
- mounted with **project quotas** enabled (`pquota` / `prjquota`)

If the volume is ext4, or XFS mounted with `noquota`, sandbox creation can fail
with errors like:

```text
Error response from daemon: --storage-opt is supported only for overlay over xfs with 'pquota' mount option
```

## Required host configuration

`/etc/fstab` must mount the Daytona data volume with `pquota`:

```fstab
/dev/disk/by-id/scsi-0HC_Volume_105319792 /mnt/HC_Volume_105319792 xfs discard,nofail,defaults,pquota 0 0
```

After editing `fstab`, a reboot is the safest way to ensure the XFS volume comes
back with quotas enabled and the nested runner Docker daemon sees the correct
mount options.

## Verification checklist

### 1. Host mount

```bash
mount | grep '^/dev/sdb'
```

Expected output includes `prjquota` (or `pquota`) and does **not** include
`noquota`.

### 2. Runner Docker root

```bash
docker exec daytona-runner-1 sh -lc 'grep " /var/lib/docker " /proc/mounts'
docker exec daytona-runner-1 sh -lc 'docker info | egrep "Storage Driver|Backing Filesystem|Docker Root Dir"'
```

Expected:

- `/var/lib/docker` on XFS
- `prjquota`/`pquota` in mount flags
- `Storage Driver: overlay2`
- `Backing Filesystem: xfs`

### 3. Daytona control plane

```bash
docker exec daytona-runner-1 sh -lc 'wget -S -O- http://api:3000/api/health'
```

Expected: HTTP `200 OK`.

### 4. Fresh sandbox creation

Create a new sandbox through the normal application path. In logs, successful
creation should no longer emit the `--storage-opt ... pquota` error.

## Operational notes

- If Daytona API/runner containers are restarted after a reboot and internal DNS
  or service discovery is flaky, restart the full Daytona compose stack under
  `/root/daytona/docker` instead of only restarting one container.
- Old sandboxes created while the runner volume was mounted with `noquota` may
  remain in `SandboxState.ERROR` and need to be recreated.
