# Change SOPS recipients

Use this guide to add or remove a machine that can decrypt this repository's
secrets.

Every public key in `keys/` can decrypt every file in `secrets/`. The
`sops-rekey` recipe writes `.sops.yaml` from those public keys and updates the
recipient metadata in each secret.

## Add a recipient

1. Add the recipient's SSH public key to `keys/`.

   Use `aly_<host>.pub` for Aly's user key. Use `root_<host>.pub` for a host
   root key.

2. Regenerate the SOPS policy and recipient metadata.

   ```sh
   just sops-rekey
   ```

3. Review the generated policy and encrypted metadata. Do not print decrypted
   secret values.

   ```sh
   git diff -- .sops.yaml secrets
   ```

4. Verify that SOPS can decrypt every secret with your current key.

   ```sh
   for secret in secrets/*.yaml; do
     sops --decrypt "$secret" >/dev/null
   done
   ```

## Remove a recipient

1. Confirm that the machine no longer needs access to `secrets/`.

2. Remove the matching public key from `keys/`.

3. Run `just sops-rekey`. When a recipient disappears from a file, the recipe
   also rotates that file's data key, so later edits stay unreadable to the
   removed key.

4. Review the policy and secret metadata as in the add-recipient procedure.

5. Replace every credential the removed key could decrypt. Git history retains
   ciphertext that the removed key can decrypt. Rekeying cannot revoke
   access to those old credential values.

Never add a private key to this repository.
