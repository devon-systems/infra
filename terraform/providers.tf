terraform {
  required_version = ">= 1.10"

  required_providers {
    b2 = {
      source  = "Backblaze/b2"
      version = "~> 0.14"
    }
    tailscale = {
      source  = "tailscale/tailscale"
      version = "~> 0.29"
    }
  }

  # Store state in the versioned B2 `aly-backups` bucket. `.envrc` puts the B2
  # application key from `secrets/b2.yaml` in the AWS variables.
  #
  # B2's S3 API at `us-east-005` does not support conditional PUT. The backend
  # cannot lock state, so run one apply at a time.
  backend "s3" {
    bucket = "aly-backups"
    key    = "cute.haus/terraform/terraform.tfstate"
    region = "us-east-005"

    endpoints = {
      s3 = "https://s3.us-east-005.backblazeb2.com"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    skip_s3_checksum            = true
  }
}

provider "b2" {
  # Reads B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY from the environment.
}

provider "tailscale" {
  # `.envrc` reads `TAILSCALE_API_KEY` from
  # `secrets/tailscale-api.yaml`.
}
