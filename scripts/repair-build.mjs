import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../app/page.tsx", import.meta.url);
const source = await readFile(file, "utf8");

// Guard against the exact malformed JSX introduced in the streaming delta renderer.
// This keeps CI/Vercel from compiling a half-written setMsgs expression.
const broken = 'setMsgs([...base,{role:"user",content:q},{role:"assistant",content:displayed}';
const fixed = 'setMsgs([...base,{role:"user",content:q},{role:"assistant",content:displayed}]);';

if (source.includes(broken) && !source.includes(fixed)) {
  await writeFile(file, source.replace(broken, fixed), "utf8");
}
