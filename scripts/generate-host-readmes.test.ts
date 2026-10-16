import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  darwinSpecificationsFor,
  sanitizeDarwinReport,
} from "./generate-host-readmes.ts";

const report = {
  SPHardwareDataType: [
    {
      machine_name: "MacBook Neo",
      machine_model: "Mac17,5",
      chip_type: "Apple A18 Pro",
      number_processors: "proc 6:2:4:0",
      physical_memory: "8 GB",
      serial_number: "private-serial",
      platform_UUID: "private-uuid",
    },
  ],
  SPDisplaysDataType: [
    {
      sppci_model: "Apple A18 Pro",
      sppci_cores: "5",
      spdisplays_ndrvs: [
        {
          _name: "Color LCD",
          spdisplays_pixelresolution: "spdisplays_2408x1506Retina",
          "_spdisplays_display-serial-number": "private-display-serial",
        },
      ],
    },
  ],
  SPNVMeDataType: [
    {
      _items: [
        {
          device_model: "APPLE SSD AP0512Z",
          size_in_bytes: 500277792768,
          device_serial: "private-disk-serial",
          volumes: [{ mount_point: "private-mount" }],
        },
      ],
    },
  ],
};

test("hardware snapshots exclude serial numbers, UUIDs, and volume state", () => {
  const captured = JSON.parse(JSON.stringify(sanitizeDarwinReport(report)));
  expect(JSON.stringify(captured)).not.toContain("private-");
  expect(captured.SPHardwareDataType[0].machine_model).toBe("Mac17,5");
  expect(captured.SPNVMeDataType[0]._items[0].size_in_bytes).toBe(500277792768);
});

test("Darwin specifications describe captured hardware", () => {
  const specifications = darwinSpecificationsFor(report);
  expect(specifications.model).toBe("MacBook Neo Mac17,5");
  expect(Object.fromEntries(specifications.rows)).toMatchObject({
    Platform: "nix-darwin",
    CPU: "Apple A18 Pro — 6 cores",
    Memory: "8 GB",
    Storage: "APPLE SSD AP0512Z — 465 GiB",
    Graphics: "Apple A18 Pro — 5 cores",
    Display: "Color LCD — 2408 × 1506 Retina",
  });
});

test("missing hardware is omitted and Intel processor counts are accepted", () => {
  expect(darwinSpecificationsFor({}).rows).toEqual([
    ["Platform", "nix-darwin"],
  ]);
  const intel = darwinSpecificationsFor({
    SPHardwareDataType: [{ cpu_type: "Intel Core i7", number_processors: 1 }],
  });
  expect(Object.fromEntries(intel.rows).CPU).toBe("Intel Core i7");
});

test("generation handles both platforms, preserves manual sections, and is repeatable", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-readmes-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    const darwin = join(root, "nix/hosts/darwin/verdanturf");
    const linux = join(root, "nix/hosts/nixos/petalburg");
    await mkdir(darwin, { recursive: true });
    await mkdir(linux, { recursive: true });
    await writeFile(
      join(darwin, "system-profiler.json"),
      JSON.stringify(sanitizeDarwinReport(report)),
    );
    await writeFile(
      join(darwin, "README.md"),
      "<!-- BEGIN GENERATED HOST SPECS -->\nold specs\n<!-- END GENERATED HOST SPECS -->\n\n## Manual notes\n\nKeep these notes.\n",
    );
    await writeFile(
      join(linux, "facter.json"),
      JSON.stringify({
        hardware: {
          cpu: [{ model_name: "Example CPU", cores: 2, siblings: 4 }],
        },
        smbios: { system: { manufacturer: "Example", product: "Desktop" } },
      }),
    );
    const generate = () =>
      execFileSync(
        process.execPath,
        [join(import.meta.dir, "generate-host-readmes.ts")],
        { cwd: root },
      );
    generate();
    const first = await readFile(join(darwin, "README.md"), "utf8");
    expect(first).toContain("MacBook Neo Mac17,5 running nix-darwin.");
    expect(first).not.toContain("old specs");
    expect(first).toEndWith("## Manual notes\n\nKeep these notes.\n");
    const nixos = await readFile(join(linux, "README.md"), "utf8");
    expect(nixos).toContain("Example Desktop running NixOS.");
    expect(nixos).toContain("Example CPU — 2 cores — 4 threads");
    generate();
    expect(await readFile(join(darwin, "README.md"), "utf8")).toBe(first);
    expect(await readFile(join(linux, "README.md"), "utf8")).toBe(nixos);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
