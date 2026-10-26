# Restore a K3s control plane

Use a Restic backup to restore the control plane after the embedded etcd
datastore is lost or corrupted. This restores Kubernetes objects, cluster
certificates, and other etcd data. Restore application data and persistent
volumes separately.

Each cluster has one K3s server. Johto and Sinnoh also have an agent. The restore resets etcd membership to the server. Skip the agent steps for Hoenn and Kanto.

| Cluster | Server     | Agent     | Restic repository                             |
| ------- | ---------- | --------- | --------------------------------------------- |
| Johto   | Olivine    | Goldenrod | `rclone:b2:aly-backups/johto/olivine/k3s`     |
| Sinnoh  | Sunnyshore | Canalave  | `rclone:b2:aly-backups/sinnoh/sunnyshore/k3s` |
| Hoenn   | Mauville   | None      | `rclone:b2:aly-backups/hoenn/mauville/k3s`    |
| Kanto   | Vermilion  | None      | `rclone:b2:aly-backups/kanto/vermilion/k3s`   |

## Before you restore

Run each step on the server or agent named in the table. If the server host
is gone, rebuild it from its NixOS configuration first. Stop K3s as soon as
the replacement starts it, then continue with this guide.

Choose a snapshot from before the incident. The restore discards every Kubernetes API change after that snapshot.

The token in `secrets/k3s.yaml` must match the selected snapshot. Do not rotate it before the restore. K3s uses the token to decrypt confidential data in the snapshot.

The server backup runs daily with a random delay of up to three hours. It creates an etcd snapshot, then saves these paths:

- `/var/lib/rancher/k3s/server/db/snapshots`
- `/var/lib/rancher/k3s/server/cred`
- `/var/lib/rancher/k3s/server/tls`

NixOS creates `restic-k3s` with the repository, B2 configuration, and password. Run it as root on the server.

## Stop the cluster

On the agent, stop K3s.

```sh
sudo systemctl stop k3s
```

On the server, stop K3s.

```sh
sudo systemctl stop k3s
```

Keep K3s stopped until the restore steps tell you to start it.

## Restore the snapshot files

On the server, list the Restic snapshots. Record the ID you will restore.

```sh
sudo restic-k3s snapshots
```

Restore the selected Restic snapshot to the root filesystem. This command restores the K3s snapshot directory, credentials, and TLS files to their original paths.

```sh
sudo restic-k3s restore <restic-snapshot-id> --target /
```

Confirm that the K3s snapshot and the SOPS-managed token exist. Do not use a snapshot from another cluster. Replace `<k3s-snapshot-file>` with the chosen file under `server/db/snapshots`.

```sh
sudo find /var/lib/rancher/k3s/server/db/snapshots -maxdepth 1 -type f -print
sudo test -s /run/secrets/k3s-token
```

## Reset etcd from the snapshot

On the server, reset etcd. This command replaces the current datastore and removes every etcd member except the server.

```sh
sudo k3s server \
	--cluster-reset \
	--cluster-reset-restore-path=/var/lib/rancher/k3s/server/db/snapshots/<k3s-snapshot-file> \
	--token-file=/run/secrets/k3s-token
```

Wait for K3s to report that it reset the managed etcd membership and is ready to restart without `--cluster-reset`. See the [K3s snapshot restore steps](https://docs.k3s.io/cli/etcd-snapshot) for the upstream procedure.

Start K3s on the server.

```sh
sudo systemctl start k3s
```

Check that the server API is ready.

```sh
sudo k3s kubectl get --raw=/readyz
```

On the agent, start K3s.

```sh
sudo systemctl start k3s
```

## Confirm recovery

On the server, check the restored cluster after K3s has started on each host.

```sh
sudo k3s kubectl get nodes -o wide
sudo k3s kubectl get pods --all-namespaces
sudo k3s kubectl -n flux-system get kustomizations.kustomize.toolkit.fluxcd.io
sudo systemctl --failed
```

Each node must report `Ready`. Flux must reconcile the `master` branch. Workloads that depend on missing application data may remain unready until you restore that data.

This procedure does not restore host files, CloudNativePG data, or other application databases. Use the application restore procedures after the control plane is healthy.
