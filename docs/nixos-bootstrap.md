# Install a NixOS host

Use this guide to install or replace a host in Hoenn, Johto, Sinnoh, or Kanto.
The host needs `disko.nix` and `facter.nix` under `nix/hosts/nixos/<host>/`.
Run every command from the host repository.

`nixos-anywhere` runs Disko and erases every disk in the host's `disko.nix`. Check the target disk before you install.

## Set the host values

Enter the host repository's development shell.

```sh
nix develop
```

Set the target values. Use the target's installer address. Do not commit it.

```sh
host_name=<host>
target_address=<installer-address>
target_host="root@$target_address"
host_dir="nix/hosts/nixos/$host_name"
bootstrap_dir=".bootstrap/$host_name"
```

The target needs root SSH access. Use a wired network when `nixos-anywhere` kexecs into its installer.

## Check the target disk

Read the disk configuration. Then check that its stable device path exists on the target.

```sh
sed -n '1,240p' "$host_dir/disko.nix"
ssh "$target_host" 'ls -l /dev/disk/by-id'
```

If the device in `disko.nix` does not match the disk you intend to erase, stop. Fix the configuration. Then validate it again.

## Prepare the SSH host key

When you reinstall the same machine, reuse its ED25519 host key. The SSH fingerprint and SOPS recipient stay the same. Put the private and public key at these paths:

```text
.bootstrap/<host>/etc/ssh/ssh_host_ed25519_key
.bootstrap/<host>/etc/ssh/ssh_host_ed25519_key.pub
```

When you replace a machine or retire its key, generate a new key.

```sh
install -d -m 700 "$bootstrap_dir"
install -d -m 755 "$bootstrap_dir/etc" "$bootstrap_dir/etc/ssh"

ssh-keygen \
	-t ed25519 \
	-N '' \
	-C "root@$host_name" \
	-f "$bootstrap_dir/etc/ssh/ssh_host_ed25519_key"

chmod 600 "$bootstrap_dir/etc/ssh/ssh_host_ed25519_key"
chmod 644 "$bootstrap_dir/etc/ssh/ssh_host_ed25519_key.pub"
install -m 644 \
	"$bootstrap_dir/etc/ssh/ssh_host_ed25519_key.pub" \
	"keys/root_${host_name}.pub"
```

`.bootstrap/` is ignored by Git. Do not commit the private key.

## Rekey the secrets

After adding or replacing the public key in `keys/`, rekey the host and
Kubernetes secrets. Adding the public key file alone does not update the
secrets. You can also run this command with an unchanged key.

```sh
just sops-rekey
```

Confirm that the staged key decrypts every host secret without printing a value. The empty environment and temporary home exclude your usual decryption keys.

```sh
(
	set -eu
	verification_dir=$(mktemp -d)
	trap 'rm -rf "$verification_dir"' EXIT
	ssh-to-age -private-key -i "$bootstrap_dir/etc/ssh/ssh_host_ed25519_key" > "$verification_dir/key.txt"
	for secret_file in secrets/*.yaml; do
		env -i PATH="$PATH" HOME="$verification_dir" \
			SOPS_AGE_KEY_FILE="$verification_dir/key.txt" \
			sops decrypt --output /dev/null "$secret_file"
	done
)
```

Review the new public key, the changed SOPS recipients, and each re-encrypted file.

```sh
git diff -- \
	"keys/root_${host_name}.pub" \
	.sops.yaml \
	secrets \
	k8s/secrets
```

## Validate the configuration

Format the repository. Run its flake checks. Then build the target host.

```sh
nix fmt
nix flake check
nix build ".#nixosConfigurations.${host_name}.config.system.build.toplevel"
```

Do not deploy or switch a host to test an installer change.

## Require the host build for automerge

Add the host to its repository's CI build workflow. Run the build successfully,
then add its exact check name to the required status checks for `master` in
GitHub's branch protection settings. Keep the existing required checks and
GitHub Actions app binding.

Confirm that the new check appears in the required list:

```sh
gh api "repos/devon-systems/<repo>/branches/master/protection/required_status_checks" \
	--jq '.checks[] | {context, app_id}'
```

A workflow job alone does not block automerge. For example, Hoenn requires
`Build lavaridge` for Lavaridge and `build-fallarbor` for the Darwin host Fallarbor.
Use the check name reported by GitHub, including any matrix suffix.

## Install the host

The command updates the `facter.json` named by `facter.nix`, copies the staged host key to `/etc/ssh`, builds NixOS, and installs it.

```sh
nix run github:nix-community/nixos-anywhere -- \
	--flake ".#${host_name}" \
	--extra-files "$bootstrap_dir" \
	--generate-hardware-config nixos-facter \
	"$host_dir/facter.json" \
	--target-host "$target_host"
```

This command formats the configured disks, installs NixOS, and restarts the target.

## Check the installed host

Remove the installer's temporary SSH key from `known_hosts`. Then compare the
installed host key with the public key in the repository.

```sh
ssh-keygen -R "$target_address"

expected_fingerprint=$(ssh-keygen -lf "keys/root_${host_name}.pub" | awk '{print $2}')
installed_fingerprint=$(
	ssh-keyscan -t ed25519 "$target_address" 2>/dev/null |
		ssh-keygen -lf - |
		awk '{print $2}'
)

test "$installed_fingerprint" = "$expected_fingerprint"
ssh "$target_host" 'hostname; systemctl --failed'
```

If the fingerprints differ, do not accept the new key.

Regenerate the host README and review it with the facter report. Then check
and build the configuration with the detected hardware.

```sh
nix run github:devon-systems/dvnpkgs#generate-host-readmes
git diff -- "$host_dir/facter.json" "$host_dir/README.md"

nix fmt
nix flake check
nix build ".#nixosConfigurations.${host_name}.config.system.build.toplevel"
```

Commit the public key, `.sops.yaml`, every re-encrypted secret, the facter report, and the generated README. Leave `.bootstrap/` untracked.

## Set up Tailscale on macOS

For nix-darwin hosts, use these steps after activation. The NixOS installation
commands above do not apply to macOS.

Hoenn keeps network-provided DNS for public names and uses a separate
`/etc/resolver/ts.net` resolver for Tailscale names. Keep
`services.tailscale.overrideLocalDns = false` so public DNS works before login.

Authenticate the Mac and follow the login URL:

```sh
sudo /run/current-system/sw/bin/tailscale up
```

Verify that Tailscale has an address and that public HTTPS works:

```sh
tailscale ip -4
curl -I --connect-timeout 5 --max-time 15 https://example.com
```

Check MagicDNS with a known peer:

```sh
dscacheutil -q host -a name petalburg.narwhal-snapper.ts.net
```

### Recover DNS before login

If Wi-Fi is connected but websites and Homebrew downloads stall, check the
configured resolver and Tailscale login state:

```sh
networksetup -getdnsservers "Wi-Fi"
tailscale ip -4
```

If DNS is `100.100.100.100` and Tailscale reports `NeedsLogin`, restore DHCP-provided
DNS on the Mac. Replace `Wi-Fi` with the active service name for wired connections.
Use `networksetup -listallnetworkservices` to list the names.

```sh
sudo networksetup -setdnsservers "Wi-Fi" Empty
```

Retry public HTTPS, then run `sudo tailscale up` to authenticate. Update the
configuration to disable `overrideLocalDns` before the next activation, or it
will replace the DNS setting again. If you temporarily set public DNS servers
manually, the same `Empty` command restores network-provided DNS.
