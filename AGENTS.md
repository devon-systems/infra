# Work in shared infrastructure

Infra manages shared Backblaze B2 buckets and the Tailscale ACL. Keep host, Kubernetes, and application changes in their deployment repositories. Keep shared recovery and operations guides in `docs/`.

`terraform/` contains OpenTofu configuration. `secrets/` contains SOPS-encrypted credentials. Every public key in `keys/` is a recipient for every file in `secrets/`.

## Validate and apply OpenTofu changes

Before applying, run:

```sh
nix fmt
nix flake check
tofu -chdir=terraform fmt -check
tofu -chdir=terraform plan
```

Review the plan before running `tofu -chdir=terraform apply`. The B2 backend does not lock state. Never run concurrent applies.

## Keep secrets out of Git

Never print decrypted values or commit private keys, OpenTofu state, or saved plans. After `keys/` changes, run `just sops-rekey` and commit every updated SOPS file with the recipient changes.
