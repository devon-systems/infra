# Tailscale ACL policy for narwhal-snapper.ts.net.

resource "tailscale_acl" "tailnet" {
  acl = <<-EOT
    {
      "acls": [
        {
          "action": "accept",
          "src":    ["*"],
          "dst":    ["*:*"],
        },
      ],

      "nodeAttrs": [
        {
          "attr":   ["mullvad"],
          "target": ["100.127.147.60"],
        },
        {
          "attr":   ["mullvad"],
          "target": ["100.88.43.71"],
        },
        {
          "attr":   ["mullvad"],
          "target": ["100.76.68.70"],
        },
        {
          "attr":   ["mullvad"],
          "target": ["100.106.251.41"],
        },
        {
          "attr":   ["mullvad"],
          "target": ["100.90.233.55"],
        },
        {
          "attr":   ["mullvad"],
          "target": ["100.101.20.12"],
        },
      ],

      "ssh": [
        {
          "src":    ["autogroup:member", "aly@passkey"],
          "dst":    ["autogroup:self", "autogroup:tagged"],
          "users":  ["autogroup:nonroot", "root"],
          "action": "accept",
        },
      ],

      "tagOwners": {
        "tag:k8s":            ["autogroup:admin"],
        "tag:hoenn-operator": ["autogroup:admin"],
        "tag:hoenn-service":  ["tag:hoenn-operator"],
        "tag:kanto-operator": ["autogroup:admin"],
        "tag:kanto-service":  ["tag:kanto-operator"],
        "tag:hermes":         ["autogroup:admin"],
        "tag:safari-ingress": ["autogroup:admin"],
        "tag:safari-service": ["autogroup:admin"],
      },

      "autoApprovers": {
        "services": {
          "tag:k8s": ["tag:k8s"],
          "tag:hoenn-service": ["tag:hoenn-service"],
        },
      },
    }
  EOT
}
