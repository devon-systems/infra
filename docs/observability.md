# Check metrics and logs

Open [Grafana](http://canalave.sinnoh:3010) through the private Sinnoh network.
Select the cluster's dashboard folder, or choose its data source in **Explore**.

| Cluster | Storage host | Metrics data source | Logs data source |
| ------- | ------------ | ------------------- | ---------------- |
| Hoenn   | Mauville     | Hoenn Prometheus    | Hoenn Loki       |
| Johto   | Olivine      | Johto Prometheus    | Johto Loki       |
| Sinnoh  | Canalave     | Sinnoh Prometheus   | Sinnoh Loki      |

Each storage host runs Prometheus and Loki as NixOS services. Both retain
30 days of data, with no disk-size cap. Grafana queries these stores directly;
it does not hold a combined copy.

NixOS journals retain up to 30 days within a 2 GiB cap and reserve 1 GiB of free
space. Alloy can read back 30 days of journals. Each storage host backs up
Prometheus and Loki to B2 daily, retaining 7 daily, 4 weekly, and 12 monthly
snapshots. All three clusters collect pod logs from every namespace.

## Check recent data

Set the time range to the last 15 minutes. In the cluster's Prometheus data
source, query `up{job="node"}` for host collection or `up{job="comin"}` for
deployment collection. Hoenn scrapes every minute; Johto and Sinnoh normally
scrape every 30 seconds.

In the cluster's Loki data source, query `{job="systemd-journal"}` for Linux
journals or `{service="comin"}` for deployment logs. Filter by `host` and
`unit` to narrow the results. Pod logs also have `namespace`,
`pod`, and `container` labels.

Use the cluster's reporting-health dashboard to inspect scrape failures,
metrics delivery, dropped logs, and log heartbeats. Missing data is unknown,
not evidence that a service is healthy.

Metrics use `cluster` and `instance` to identify their source. Restic completion
metrics use the `restic_backup_*` prefix, and Kubernetes workload ownership uses
`pod_workload_info`. Host log heartbeats have `service="observability-canary"`.

## Check collection

On the affected Linux host:

```sh
systemctl status alloy --no-pager
journalctl -u alloy --since '15 minutes ago' --no-pager
```

On Verdanturf:

```sh
sudo launchctl print system/org.nixos.alloy
```

For Kubernetes collection, use the `hoenn`, `johto`, or `sinnoh` context:

```sh
kubectl --context=johto -n alloy-system get pods
kubectl --context=johto -n alloy-system logs deployment/alloy -c alloy --since=15m
```

Check the storage host's readiness endpoints. Replace `olivine` with the host
from the table above.

```sh
ssh root@olivine 'curl --fail http://127.0.0.1:3020/-/ready'
ssh root@olivine 'curl --fail http://127.0.0.1:3030/ready'
```

If either endpoint fails, inspect `prometheus.service` or `loki.service` and
its journal on that host. If both respond but Grafana cannot query them,
check Canalave's data-source connection and its Tailscale route to the host.

## Account for collection gaps

- Sleeping or disconnected Hoenn hosts leave gaps. Their metrics arrive through
  remote write, so they do not appear on Mauville's Prometheus targets page.
- Verdanturf tails `system.log`, `nix-darwin-upgrade.log`, and `comin.log` under
  `/var/log`, plus a rotating heartbeat log. It does not collect macOS unified logging.
- Sootopolis's system-manager configuration requires an existing Tailscale
  connection to Mauville. It does not manage networking or run Comin.
- Sinnoh has Prometheus alerts delivered by email through Alertmanager. Hoenn
  and Johto have no equivalent notification route configured.

For collector inputs and service settings, use the cluster configuration:
[Hoenn](https://github.com/devon-systems/hoenn/tree/master/nix/modules/observability),
[Johto](https://github.com/devon-systems/johto/tree/master/nix/hosts/nixos/olivine/observability),
and [Sinnoh](https://github.com/devon-systems/sinnoh/tree/master/nix/hosts/nixos/canalave/grafana).
