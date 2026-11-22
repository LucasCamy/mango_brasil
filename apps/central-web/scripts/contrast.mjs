import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  new URL("../src/styles/tokens.css", import.meta.url),
  "utf8",
);
const palettes = [":root", ".dark"].map((selector) => {
  const content = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries(
    [...content.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
});
function luminance(hex) {
  const rgb = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const ratio = (first, second) => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const surfaces = ["bg", "surface", "subtle", "selected"];
const text = ["ink", "muted", "action", "success", "warning", "destructive"];
let failed = false;
let table =
  "| Tema | Texto | bg | surface | subtle | selected |\n|---|---|---:|---:|---:|---:|\n";
for (const [index, palette] of palettes.entries()) {
  for (const token of text) {
    const values = surfaces.map((surface) =>
      ratio(palette[token], palette[surface]),
    );
    if (values.some((value) => value < 4.5)) failed = true;
    table += `| ${index ? "Escuro" : "Claro"} | ${token} | ${values.map((value) => `${value.toFixed(2)}:1`).join(" | ")} |\n`;
  }
}
table += "\n| Tema | Uso | Contraste | Mínimo |\n|---|---|---:|---:|\n";
for (const [index, palette] of palettes.entries()) {
  for (const [fg, bg, minimum] of [
    ["on-action", "action", 4.5],
    ["on-night", "night", 4.5],
    ...surfaces.map((surface) => ["line", surface, 3]),
  ]) {
    const value = ratio(palette[fg], palette[bg]);
    if (value < minimum) failed = true;
    table += `| ${index ? "Escuro" : "Claro"} | ${fg} sobre ${bg} | ${value.toFixed(2)}:1 | ${minimum}:1 |\n`;
  }
}
const target = new URL("../../../DESIGN.md", import.meta.url);
if (process.argv.includes("--write")) {
  const existing = readFileSync(target, "utf8");
  writeFileSync(
    target,
    existing.replace(
      /<!-- contrast:start -->[\s\S]*?<!-- contrast:end -->/,
      `<!-- contrast:start -->\n${table}<!-- contrast:end -->`,
    ),
  );
  process.stdout.write(`Tabela calculada em ${fileURLToPath(target)}\n`);
} else process.stdout.write(table);
if (failed) {
  process.stderr.write("Contraste reprovado: ajuste tokens antes do build.\n");
  process.exitCode = 1;
}
