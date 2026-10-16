import { execFileSync } from "node:child_process";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BYTES_PER_GIBIBYTE = 1024 ** 3;
const KIBIBYTES_PER_GIBIBYTE = 1024 ** 2;
const FACTER_HOSTS_DIRECTORY = "nix/hosts/nixos";
const DARWIN_HOSTS_DIRECTORY = "nix/hosts/darwin";
const GENERATED_SECTION_START = "<!-- BEGIN GENERATED HOST SPECS -->";
const GENERATED_SECTION_END = "<!-- END GENERATED HOST SPECS -->";
const GIT_COMMAND = "git";
const SSH_COMMAND = "ssh";
const DEFAULT_HOST_EMOJI = "🖥️";
const HOST_EMOJIS: Record<string, string> = {
  canalave: "⚓",
  fallarbor: "🍃",
  goldenrod: "📻",
  mauville: "⚡",
  olivine: "⚓",
  pacifidlog: "🪵",
  petalburg: "🌸",
  rustboro: "🪨",
  sootopolis: "🌊",
  sunnyshore: "☀️",
  verdanturf: "🌿",
};

type Specification = readonly [component: string, details: string];

interface Disk {
  model?: string;
  resources?: Array<{
    type?: string;
    unit?: string;
    value_1?: number;
    value_2?: number;
  }>;
  sysfs_id?: string;
}

interface FacterReport {
  hardware?: {
    cpu?: Array<{ cores?: number; model_name?: string; siblings?: number }>;
    disk?: Disk[];
    graphics_card?: Array<{ model?: string; vendor?: { name?: string } }>;
  };
  smbios?: {
    bios?: { date?: string; vendor?: string; version?: string };
    chassis?: Array<{ chassis_type?: { name?: string } }>;
    memory_device?: Array<{ size?: number }>;
    system?: { manufacturer?: string; product?: string; version?: string };
  };
}

interface DarwinReport {
  SPHardwareDataType?: Array<{
    machine_name?: string;
    machine_model?: string;
    chip_type?: string;
    cpu_type?: string;
    number_processors?: string | number;
    physical_memory?: string;
    boot_rom_version?: string;
  }>;
  SPDisplaysDataType?: Array<{
    sppci_model?: string;
    sppci_cores?: string;
    spdisplays_ndrvs?: Array<{
      _name?: string;
      spdisplays_pixelresolution?: string;
    }>;
  }>;
  SPNVMeDataType?: Array<{
    _items?: Array<{ device_model?: string; size_in_bytes?: number }>;
  }>;
}

interface HostSpecifications {
  platform: "NixOS" | "nix-darwin";
  model: string;
  rows: Specification[];
}

export function sanitizeDarwinReport(report: DarwinReport): DarwinReport {
  // Keep hardware descriptions without serial numbers, UUIDs, or volume state.
  return {
    SPHardwareDataType: (report.SPHardwareDataType ?? []).map((hardware) => ({
      machine_name: hardware.machine_name,
      machine_model: hardware.machine_model,
      chip_type: hardware.chip_type,
      cpu_type: hardware.cpu_type,
      number_processors: hardware.number_processors,
      physical_memory: hardware.physical_memory,
      boot_rom_version: hardware.boot_rom_version,
    })),
    SPDisplaysDataType: (report.SPDisplaysDataType ?? []).map((graphics) => ({
      sppci_model: graphics.sppci_model,
      sppci_cores: graphics.sppci_cores,
      spdisplays_ndrvs: (graphics.spdisplays_ndrvs ?? []).map((display) => ({
        _name: display._name,
        spdisplays_pixelresolution: display.spdisplays_pixelresolution,
      })),
    })),
    SPNVMeDataType: (report.SPNVMeDataType ?? []).map((controller) => ({
      _items: (controller._items ?? []).map((disk) => ({
        device_model: disk.device_model,
        size_in_bytes: disk.size_in_bytes,
      })),
    })),
  };
}

export function darwinSpecificationsFor(
  report: DarwinReport,
): HostSpecifications {
  const hardware = report.SPHardwareDataType?.[0];
  const model = joinDetails([hardware?.machine_name, hardware?.machine_model]);
  const coreCount =
    typeof hardware?.number_processors === "string"
      ? hardware.number_processors.match(/^proc (\d+):/)?.[1]
      : undefined;
  const storage = (report.SPNVMeDataType ?? []).flatMap((controller) =>
    (controller._items ?? []).map((disk) =>
      [
        disk.device_model,
        disk.size_in_bytes === undefined
          ? undefined
          : `${Math.floor(disk.size_in_bytes / BYTES_PER_GIBIBYTE)} GiB`,
      ]
        .filter(isMeaningfulString)
        .join(" — "),
    ),
  );
  const graphics = (report.SPDisplaysDataType ?? []).map((card) =>
    [card.sppci_model, card.sppci_cores && `${card.sppci_cores} cores`]
      .filter(isMeaningfulString)
      .join(" — "),
  );
  const displays = (report.SPDisplaysDataType ?? []).flatMap((card) =>
    (card.spdisplays_ndrvs ?? []).map((display) =>
      [
        display._name,
        display.spdisplays_pixelresolution?.replace(
          /^spdisplays_(\d+)x(\d+)(Retina)?$/,
          (_, width, height, retina) =>
            `${width} × ${height}${retina ? " Retina" : ""}`,
        ),
      ]
        .filter(isMeaningfulString)
        .join(" — "),
    ),
  );

  const rows: Specification[] = [
    ["Platform", "nix-darwin"],
    ["Model", model],
    [
      "CPU",
      [
        hardware?.chip_type ?? hardware?.cpu_type,
        coreCount && `${coreCount} cores`,
      ]
        .filter(isMeaningfulString)
        .join(" — "),
    ],
    ["Memory", hardware?.physical_memory ?? ""],
    ["Storage", uniqueDetails(storage)],
    ["Graphics", uniqueDetails(graphics)],
    ["Display", uniqueDetails(displays)],
    ["Firmware", hardware?.boot_rom_version ?? ""],
  ];
  return {
    platform: "nix-darwin",
    model,
    rows: rows.filter(([, details]) => details !== ""),
  };
}

function isMeaningfulString(value: string | undefined): value is string {
  return value !== undefined && value !== "" && value !== "Default string";
}

function joinDetails(values: Array<string | undefined>): string {
  return values.filter(isMeaningfulString).join(" ");
}

function formatGibibytes(value: number): string {
  if (value === 0) {
    return "Unknown";
  }

  const gibibytes = value / KIBIBYTES_PER_GIBIBYTE;
  return Number.isInteger(gibibytes)
    ? `${gibibytes} GiB`
    : `${gibibytes.toFixed(1)} GiB`;
}

function describeModel(report: FacterReport): string {
  const system = report.smbios?.system;
  return joinDetails([system?.manufacturer, system?.version, system?.product]);
}

function describeCpu(report: FacterReport): string {
  const cpu = report.hardware?.cpu?.[0];
  if (cpu === undefined) {
    return "Unknown";
  }

  return [
    cpu.model_name ?? "Unknown",
    cpu.cores === undefined || cpu.cores === 0
      ? undefined
      : `${cpu.cores} cores`,
    cpu.siblings === undefined || cpu.siblings === 0
      ? undefined
      : `${cpu.siblings} threads`,
  ]
    .filter(isMeaningfulString)
    .join(" — ");
}

function describeMemory(report: FacterReport): string {
  const kibibytes = (report.smbios?.memory_device ?? []).reduce(
    (total, device) => total + (device.size ?? 0),
    0,
  );
  return formatGibibytes(kibibytes);
}

function describeDisk(disk: Disk): string {
  const bytes = (disk.resources ?? [])
    .filter(
      (resource) => resource.type === "size" && resource.unit === "sectors",
    )
    .reduce(
      (total, resource) =>
        total + (resource.value_1 ?? 0) * (resource.value_2 ?? 0),
      0,
    );
  const capacity =
    bytes === 0 ? undefined : `${Math.floor(bytes / BYTES_PER_GIBIBYTE)} GiB`;

  return [disk.model ?? "Unknown", capacity]
    .filter(isMeaningfulString)
    .join(" — ");
}

function uniqueDetails(values: string[]): string {
  return [...new Set(values.filter(isMeaningfulString))].join("; ");
}

function describeStorage(report: FacterReport): string {
  return uniqueDetails(
    (report.hardware?.disk ?? [])
      .filter((disk) => !disk.sysfs_id?.startsWith("/class/block/zram"))
      .map(describeDisk),
  );
}

function describeGraphics(report: FacterReport): string {
  return uniqueDetails(
    (report.hardware?.graphics_card ?? []).map((card) =>
      joinDetails([card.vendor?.name, card.model]),
    ),
  );
}

function specificationsFor(report: FacterReport): Specification[] {
  const model = describeModel(report);
  const bios = report.smbios?.bios;
  const specifications: Specification[] = [
    ["Platform", "NixOS"],
    ["Model", model],
    ["Chassis", report.smbios?.chassis?.[0]?.chassis_type?.name ?? ""],
    ["CPU", describeCpu(report)],
    ["Memory", describeMemory(report)],
    ["Storage", describeStorage(report)],
    ["Graphics", describeGraphics(report)],
    ["Firmware", joinDetails([bios?.vendor, bios?.version, bios?.date])],
  ];

  return specifications.filter(
    ([, details]) => details !== "" && details !== "Unknown",
  );
}

function renderTable(specifications: Specification[]): string {
  const rows = specifications.map(([component, details]) => [
    component,
    details.replaceAll("|", "\\|"),
  ]);
  const componentWidth = Math.max(
    "Component".length,
    ...rows.map(([component]) => component.length),
  );
  const detailsWidth = Math.max(
    "Details".length,
    ...rows.map(([, details]) => details.length),
  );
  const formatRow = (component: string, details: string): string =>
    `| ${component.padEnd(componentWidth)} | ${details.padEnd(detailsWidth)} |`;

  return [
    formatRow("Component", "Details"),
    `| ${"-".repeat(componentWidth)} | ${"-".repeat(detailsWidth)} |`,
    ...rows.map(([component, details]) => formatRow(component, details)),
  ].join("\n");
}

function renderGeneratedSection(
  hostName: string,
  repositoryName: string,
  specifications: HostSpecifications,
): string {
  const emoji = HOST_EMOJIS[hostName.toLowerCase()] ?? DEFAULT_HOST_EMOJI;
  const { model, platform } = specifications;
  const overview =
    model === ""
      ? `${platform} host managed by ${repositoryName}.`
      : `${model} running ${platform}.`;
  const table = renderTable(specifications.rows);

  return [
    GENERATED_SECTION_START,
    "",
    `# ${emoji} ${hostName}`,
    "",
    "## Overview",
    "",
    overview,
    "",
    "## Specs",
    "",
    table,
    "",
    GENERATED_SECTION_END,
    "",
  ].join("\n");
}

function hostTitle(hostName: string): string {
  return `${hostName[0]?.toUpperCase()}${hostName.slice(1)}`;
}

function repositoryTitle(): string {
  const repositoryName = repositoryRoot().split("/").at(-1) ?? "";
  return hostTitle(repositoryName);
}

function repositoryRoot(): string {
  return execFileSync(GIT_COMMAND, ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

function manualReadmeContent(existingReadme: string): string {
  const sectionStart = existingReadme.indexOf(GENERATED_SECTION_START);
  const sectionEnd = existingReadme.indexOf(GENERATED_SECTION_END);
  if (sectionStart !== -1 && sectionEnd > sectionStart) {
    return existingReadme
      .slice(sectionEnd + GENERATED_SECTION_END.length)
      .trimStart();
  }

  if (
    existingReadme.startsWith("<!-- Generated by scripts/generate-host-readmes")
  ) {
    return "";
  }

  return existingReadme.trimStart();
}

async function hasReport(
  hostDirectory: string,
  fileName: string,
): Promise<boolean> {
  try {
    await access(join(hostDirectory, fileName));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function hostNames(hostsDirectory: string): Promise<string[]> {
  try {
    return (await readdir(hostsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function generateHostReadme(
  hostDirectory: string,
  hostName: string,
  repositoryName: string,
  specifications: HostSpecifications,
): Promise<void> {
  const readmePath = join(hostDirectory, "README.md");
  const existingReadme = await readFile(readmePath, "utf8").catch(() => "");
  const manualContent = manualReadmeContent(existingReadme);
  const generatedSection = renderGeneratedSection(
    hostTitle(hostName),
    repositoryName,
    specifications,
  );
  const nextReadme = [generatedSection, manualContent]
    .filter((content) => content !== "")
    .join("\n");

  if (nextReadme !== existingReadme) {
    await writeFile(readmePath, nextReadme);
  }
}

async function captureDarwinHardware(hostName: string): Promise<void> {
  const hostDirectory = join(DARWIN_HOSTS_DIRECTORY, hostName);
  await access(join(hostDirectory, "default.nix"));
  const report = JSON.parse(
    execFileSync(
      SSH_COMMAND,
      [
        "-o",
        "BatchMode=yes",
        `${hostName}.local`,
        "/usr/sbin/system_profiler",
        "-json",
        "SPHardwareDataType",
        "SPDisplaysDataType",
        "SPNVMeDataType",
      ],
      { encoding: "utf8" },
    ),
  ) as DarwinReport;
  if ((report.SPHardwareDataType ?? []).length === 0) {
    throw new Error(`No hardware information returned by ${hostName}.`);
  }
  await writeFile(
    join(hostDirectory, "system-profiler.json"),
    JSON.stringify(sanitizeDarwinReport(report), null, 2) + "\n",
  );
}

async function main(): Promise<void> {
  process.chdir(repositoryRoot());
  const repositoryName = repositoryTitle();

  const args = process.argv.slice(2);
  if (args.length !== 0) {
    const hostName = args[1];
    if (
      args.length !== 2 ||
      args[0] !== "--capture-darwin" ||
      hostName === undefined ||
      !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(hostName)
    ) {
      throw new Error("Usage: generate-host-readmes [--capture-darwin HOST]");
    }
    await captureDarwinHardware(hostName);
  }

  const nixosHosts = await hostNames(FACTER_HOSTS_DIRECTORY);
  const darwinHosts = await hostNames(DARWIN_HOSTS_DIRECTORY);
  if (nixosHosts.length === 0 && darwinHosts.length === 0) {
    throw new Error(
      "The current repository does not contain NixOS or Darwin hosts.",
    );
  }
  for (const hostName of nixosHosts.sort()) {
    const hostDirectory = join(FACTER_HOSTS_DIRECTORY, hostName);
    if (await hasReport(hostDirectory, "facter.json")) {
      const report = JSON.parse(
        await readFile(join(hostDirectory, "facter.json"), "utf8"),
      ) as FacterReport;
      await generateHostReadme(hostDirectory, hostName, repositoryName, {
        platform: "NixOS",
        model: describeModel(report),
        rows: specificationsFor(report),
      });
    }
  }
  for (const hostName of darwinHosts.sort()) {
    const hostDirectory = join(DARWIN_HOSTS_DIRECTORY, hostName);
    if (await hasReport(hostDirectory, "system-profiler.json")) {
      const report = JSON.parse(
        await readFile(join(hostDirectory, "system-profiler.json"), "utf8"),
      ) as DarwinReport;
      await generateHostReadme(
        hostDirectory,
        hostName,
        repositoryName,
        darwinSpecificationsFor(report),
      );
    }
  }
}

if (import.meta.main) {
  await main();
}
