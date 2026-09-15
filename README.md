# Shared infrastructure

`infra` is the home for the account-level configuration shared by the Pokeworld repositories, plus the runbooks that go with it. Terraform manages the Backblaze B2 buckets and the Tailscale ACL. The rest of the systems live in the repositories that deploy them.

| Repository | What lives there                                        |
| ---------- | ------------------------------------------------------- |
| `infra`    | B2 buckets, the Tailscale ACL, and shared documentation |
| `sinnoh`   | Production hosts and services                           |
| `johto`    | Home-lab hosts and services                             |
| `hoenn`    | Personal machines                                       |

## What's here

`terraform/` contains the shared OpenTofu configuration. `secrets/` contains the encrypted credentials it needs, and `keys/` contains the SOPS recipients. The [docs](docs/) directory holds the operational guides, including host installation, K3s recovery, Secure Boot, OpenTofu, and SOPS. `scripts/` contains shared repository maintenance utilities.

## Working locally

Run `nix develop` for the pinned tooling. Start with the relevant guide in [docs](docs/) when you need to change infrastructure or recover a system.

From Hoenn, Sinnoh, or Johto, refresh generated host hardware documentation:

```sh
nix run github:alyraffauf/infra#generate-host-readmes
```
