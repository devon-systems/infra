# Set up Secure Boot and TPM LUKS unlock

Use Lanzaboote to boot a NixOS host with Secure Boot. The configuration below generates the Secure Boot keys after the first boot and prepares them for enrollment. If the host has a TPM 2.0 device, you can also enroll a LUKS keyslot that unlocks during boot.

1. Import `self.nixosModules.lanzaboote` in Johto, Sinnoh, or Kanto. Hoenn includes Lanzaboote in `self.nixosModules.nixos`. For a standalone configuration, import `inputs.lanzaboote.nixosModules.lanzaboote` and add these settings.

   ```nix
   boot = {
   loader.systemd-boot.enable = lib.mkForce false; # Lanzaboote requires this setting to be false.

   lanzaboote = {
   	enable = true;
   	autoGenerateKeys.enable = true;
   	autoEnrollKeys.enable = true;
   	configurationLimit = 10;
   	pkiBundle = "/var/lib/sbctl";
   };
   };
   ```

   `autoGenerateKeys` generates keys in `/var/lib/sbctl` only if no keys exist. `autoEnrollKeys` prepares the keys for enrollment and configures `systemd-boot` to enroll them during the next restart. It includes Microsoft keys by default.

   `configurationLimit = 10` keeps the ten newest NixOS generations in the boot menu. Keep `/var/lib/sbctl` available across reboots. The directory contains the signing keys.

1. In the UEFI settings, set Secure Boot to "setup mode" or erase the platform keys.

1. Deploy the configuration and restart the host. On its first boot, Lanzaboote generates the keys and writes the enrollment files to the EFI system partition.

1. Restart the host again. `systemd-boot` enrolls the keys during this restart and enables Secure Boot.

1. Run `bootctl status` to confirm that Secure Boot is enabled.

   ```bash
   System:
         Firmware: UEFI 2.70 (American Megatrends 5.17)
   Firmware Arch: x64
     Secure Boot: enabled (user)
     TPM2 Support: yes
     Measured UKI: yes
     Boot into FW: supported
   ```

1. If the root partition uses LUKS and the host has TPM 2.0, enroll a TPM-backed keyslot.

   ```bash
   sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=0+2+7+12 --wipe-slot=tpm2 /dev/nvme0n1p2
   ```

   Replace `/dev/nvme0n1p2` with the root partition. The command binds the keyslot to these PCRs:
   - PCR 0 measures core platform firmware.
   - PCR 2 measures UEFI drivers and option ROMs that the firmware loads.
   - PCR 7 measures the Secure Boot state and trust policy.
   - PCR 12 measures initrd global credentials and other boot configuration.

   PCR measurements depend on the platform. Firmware or device changes can change PCR 0 or PCR 2. Changes to Secure Boot keys or policy can change PCR 7. NixOS or systemd updates that change initrd global credentials can change PCR 12.

   If a selected PCR value changes, TPM unlock fails and LUKS prompts for its recovery passphrase. Keep a recovery passphrase and test it before you rely on unattended boot.

   PCR 4 measures the bootloader and the selected Lanzaboote EFI image. It ties the keyslot to a particular boot image, but the measurement changes when you install a new image. Do not add PCR 4 to a static `systemd-cryptenroll --tpm2-pcrs=` policy when boot-image updates must remain unattended. A policy that accepts several boot measurements needs managed PCR policies.

   See the [Linux TPM PCR Registry](https://uapi-group.org/specifications/specs/linux_tpm_pcr_registry/) for PCR definitions.
