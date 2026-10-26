# infra

Infra manages Backblaze B2 buckets and the Tailscale ACL with OpenTofu. This
repository also holds shared installation, recovery, and operations guides.

## Repository scope

Host, Kubernetes, and application configuration lives in the repository that
deploys it:

| Repository                                        | Purpose                            |
| ------------------------------------------------- | ---------------------------------- |
| [Sinnoh](https://github.com/devon-systems/sinnoh) | Production hosts and services      |
| [Johto](https://github.com/devon-systems/johto)   | Homelab hosts and services         |
| [Hoenn](https://github.com/devon-systems/hoenn)   | Personal machines and k3s services |
| [Kanto](https://github.com/devon-systems/kanto)   | Shared inference and applications  |

Keep shared recovery and operations guides in this repository.

## Repository layout

```text
terraform/            OpenTofu configuration for B2 and Tailscale
secrets/              SOPS-encrypted provider credentials
keys/                 Public SOPS recipients
docs/                 Installation, recovery, and operations guides
nix/                  Development tools
```

The [guides](docs/) cover host installation, k3s recovery,
Secure Boot, OpenTofu, SOPS, and observability.

## Generate host documentation

Run the generator from a host configuration repository after changing its
hardware report:

```sh
nix run github:devon-systems/dvnpkgs#generate-host-readmes
```

The dvnpkgs generator reads `facter.json` for NixOS and
`system-profiler.json` for nix-darwin. To capture a Mac's hardware over SSH and regenerate its README:

```sh
nix run github:devon-systems/dvnpkgs#generate-host-readmes -- --capture-darwin verdanturf
```

The capture connects to `<host>.local` and excludes serial numbers, UUIDs, and
mounted-volume details. Later runs use the saved report without connecting to
the host.

## Development

Enter the pinned development shell with `nix develop`, or run `direnv allow` to
load the shell and encrypted provider credentials. Then run:

```sh
nix fmt
nix flake check
```

For OpenTofu changes, run `tofu -chdir=terraform init` on a fresh checkout, then
run:

```sh
tofu -chdir=terraform fmt -check
tofu -chdir=terraform plan
```

Review the plan before applying. The B2 backend does not lock state, so never
run concurrent applies. See the [OpenTofu guide](docs/opentofu.md) for changes,
credential rotation, and state recovery.

## Secrets

Edit encrypted provider credentials with SOPS:

```sh
just sops-edit b2.yaml
just sops-edit tailscale-api.yaml
```

Every public key in `keys/` can decrypt every file in `secrets/`. After changing
recipients, run `just sops-rekey` and commit `.sops.yaml` with the updated secret
files. See the [SOPS guide](docs/sops.md) for the full procedure.

Never commit private keys, decrypted credentials, OpenTofu state, or saved
plans.

This project is available under the [MIT License](LICENSE.md).
