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

  # B2 does not support conditional PUT here, so this backend cannot lock state.
  # Run one apply at a time. `.envrc` loads the B2 key into the AWS variables.
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
  # `.envrc` loads TAILSCALE_API_KEY from secrets/tailscale-api.yaml.
}
