_: {
  perSystem = {pkgs, ...}: {
    packages.generate-host-readmes = pkgs.stdenv.mkDerivation {
      pname = "generate-host-readmes";
      version = "0.2.0";
      src = ../scripts;

      nativeBuildInputs = [pkgs.bun pkgs.git];

      # Fixup corrupts Bun's embedded application bundle.
      dontFixup = true;

      patchPhase = ''
        substituteInPlace generate-host-readmes.ts \
          --replace-fail 'const GIT_COMMAND = "git";' \
          'const GIT_COMMAND = "${pkgs.git}/bin/git";'
        substituteInPlace generate-host-readmes.ts \
          --replace-fail 'const SSH_COMMAND = "ssh";' \
          'const SSH_COMMAND = "${pkgs.openssh}/bin/ssh";'
      '';

      buildPhase = ''
        bun build generate-host-readmes.ts --compile --outfile generate-host-readmes
      '';

      doCheck = true;
      checkPhase = "bun test";

      installPhase = ''
        install -Dm755 generate-host-readmes "$out/bin/generate-host-readmes"
      '';
    };
  };
}
