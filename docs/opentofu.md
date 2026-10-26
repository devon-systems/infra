# Change OpenTofu

Use this guide to change a B2 bucket or the Tailscale ACL.

1. From the repository root, load the encrypted credentials.

   ```sh
   direnv allow
   ```

2. Initialize OpenTofu, then inspect the plan.

   ```sh
   tofu -chdir=terraform init
   tofu -chdir=terraform plan
   ```

3. If the plan has only the changes you expect, apply it.

   ```sh
   tofu -chdir=terraform apply
   ```

## Recover OpenTofu state

The state file is `cute.haus/terraform/terraform.tfstate` in the versioned
`aly-backups` bucket. B2 does not provide a state lock for this backend.

1. Stop every planned or running `tofu apply`.

2. In B2, open the file versions for
   `cute.haus/terraform/terraform.tfstate`. Download the current version and
   the version that you want to recover.

3. Inspect the candidate state before you replace the current file. Use an
   absolute path, because `-chdir` resolves relative paths inside
   `terraform/`. Don't use `state list -state=`: with the S3 backend it
   ignores the file and lists the current remote state.

   ```sh
   tofu -chdir=terraform show /absolute/path/to/candidate.tfstate
   ```

4. Upload the verified candidate as
   `cute.haus/terraform/terraform.tfstate`. B2 retains the replaced state as
   another file version.

5. Reinitialize the backend, then inspect the plan.

   ```sh
   tofu -chdir=terraform init -reconfigure
   tofu -chdir=terraform plan
   ```

Apply only after the plan describes the expected remote objects.

## Rotate provider credentials

1. Create replacement credentials in B2 or Tailscale. Keep the old
   credential valid until the replacement works.

2. Update the encrypted credential.

   ```sh
   just sops-edit b2
   just sops-edit tailscale-api
   ```

3. Reload the environment, then verify that OpenTofu can read the state and
   both providers.

   ```sh
   direnv reload
   tofu -chdir=terraform init -reconfigure
   tofu -chdir=terraform plan
   ```

4. If another repository uses the replaced credential, update its encrypted
   secret before you revoke the old credential.

5. Revoke the old credential after the new one works.
